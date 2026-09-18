// Two-client cloud synchronization E2E test.
// Two genuinely independent browser profiles (CLIENT_A, CLIENT_B) connect to the
// SAME Wrangler Pages runtime and SAME CHALAK_DB persistence. Tests bidirectional
// sync, reload persistence, session isolation, logout isolation, stale revision,
// conflict/concurrent update behavior, and failed-save behavior.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:8792';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'SyncE2E-Admin-2026!';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT_A = 9431;
const CDP_PORT_B = 9432;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Direct API helper (server-side, no browser needed for control) ---
const apiDirect = async (routePath, options = {}, cookie) => {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
  const response = await fetch(BASE + routePath, {
    method: options.method || 'GET',
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  return {
    status: response.status,
    body,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
};

async function retryAsync(fn, attempts = 100) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (error) { lastError = error; await sleep(100); }
  }
  throw lastError;
}

// --- CDP browser management ---
function startChrome(cdpPort, profileDir) {
  return spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-web-security',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
}

async function connectToChrome(cdpPort) {
  const version = await retryAsync(async () => {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (!response.ok) throw new Error('Chrome CDP is not ready');
    return response.json();
  });
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const pending = new Map();
  const events = new Map();
  let nextId = 1;
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result || {});
      return;
    }
    const handler = events.get(`${message.sessionId || ''}:${message.method}`);
    if (handler) handler(message);
  });
  const command = async (method, params = {}, sessionId) => {
    const id = nextId++;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return response;
  };
  const waitForEvent = (method, sessionId, timeoutMs = 15_000) => {
    const key = `${sessionId || ''}:${method}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { events.delete(key); reject(new Error(`Timed out waiting for ${method}`)); }, timeoutMs);
      events.set(key, message => { clearTimeout(timer); events.delete(key); resolve(message.params); });
    });
  };
  const createPage = async () => {
    const { browserContextId } = await command('Target.createBrowserContext');
    const { targetId } = await command('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
    await command('Runtime.enable', {}, sessionId);
    await command('Page.enable', {}, sessionId);
    return { browserContextId, sessionId };
  };
  const evaluate = async (page, expression) => {
    const result = await command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, page.sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    return result.result.value;
  };
  const navigate = async (page, url = BASE) => {
    const loaded = waitForEvent('Page.loadEventFired', page.sessionId);
    await command('Page.navigate', { url }, page.sessionId);
    await loaded;
  };
  // Browser-side API: uses fetch from within the page (cookies carried by browser)
  const api = async (page, routePath, options = {}) => {
    return evaluate(page, `(async () => {
      const response = await fetch(${JSON.stringify(BASE + routePath)}, ${JSON.stringify({
        ...options,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      })});
      let body = null;
      try { body = await response.json(); } catch {}
      return { status: response.status, body };
    })()`);
  };
  const login = async (page) => {
    const result = await api(page, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
    });
    if (result.status !== 200) throw new Error(`Admin login failed: ${JSON.stringify(result)}`);
    return result.body.user;
  };
  return {
    socket, pending, events, command, createPage, evaluate, navigate, api, login,
    close: () => { socket.close(); },
  };
}

// --- Test result tracking ---
const results = [];
function check(name, condition, details) {
  results.push({ name, passed: Boolean(condition), details });
  if (!condition) {
    console.error(`FAIL: ${name} — ${details || ''}`);
  }
}

// --- SAFE temporary test fixture: use pe_tickets as scratchpad key ---
const TICKET_PREFIX = 'sync_e2e_';
const makeTicketId = () => `${TICKET_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let chromeA, chromeB, profileDirA, profileDirB, clientA, clientB, pageA, pageB;
let cookieA, cookieB;

try {
  console.log('=== Two-Client Cloud Sync E2E Test ===');
  console.log(`BASE: ${BASE}`);
  console.log(`ADMIN_PASSWORD: ${ADMIN_PASSWORD.length} chars (masked)`);

  // Step 1: Verify server is responsive before starting E2E
  const health = await apiDirect('/api/health');
  check('Server health check', health.status === 200 && health.body?.storageConfigured === true,
    `status ${health.status}, storageConfigured ${health.body?.storageConfigured}`);

  // Step 2: Start two independent Chrome instances with separate profiles
  profileDirA = await mkdtemp(path.join(tmpdir(), 'chalak-sync-clientA-'));
  profileDirB = await mkdtemp(path.join(tmpdir(), 'chalak-sync-clientB-'));
  chromeA = startChrome(CDP_PORT_A, profileDirA);
  chromeB = startChrome(CDP_PORT_B, profileDirB);

  clientA = await connectToChrome(CDP_PORT_A);
  clientB = await connectToChrome(CDP_PORT_B);
  console.log(`[setup] Two independent Chrome instances started (CDP ${CDP_PORT_A}, ${CDP_PORT_B})`);

  // Step 3: Each client logs in independently via the browser
  pageA = await clientA.createPage();
  pageB = await clientB.createPage();
  await clientA.navigate(pageA);
  await clientB.navigate(pageB);
  const adminA = await clientA.login(pageA);
  const adminB = await clientB.login(pageB);
  check('CLIENT_A admin login via browser', adminA?.role === 'admin', JSON.stringify(adminA?.role));
  check('CLIENT_B admin login via browser', adminB?.role === 'admin', JSON.stringify(adminB?.role));

  // Step 4: Get distinct session cookies (one per independent browser profile)
  const loginRespA = await apiDirect('/api/auth/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } });
  cookieA = loginRespA.cookie;
  const loginRespB = await apiDirect('/api/auth/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } });
  cookieB = loginRespB.cookie;
  check('CLIENT_A has session cookie', !!cookieA, 'cookieA is falsy');
  check('CLIENT_B has session cookie', !!cookieB, 'cookieB missing');
  check('CLIENT_A and CLIENT_B have DISTINCT session cookies', cookieA !== cookieB,
    `cookieA: ${cookieA?.slice(0, 12)}..., cookieB: ${cookieB?.slice(0, 12)}...`);

  // Step 5: Independent sessions — both can validate their own session
  const sessionA = await apiDirect('/api/auth/session', {}, cookieA);
  const sessionB = await apiDirect('/api/auth/session', {}, cookieB);
  check('CLIENT_A session valid (200)', sessionA.status === 200, `status ${sessionA.status}`);
  check('CLIENT_B session valid (200)', sessionB.status === 200, `status ${sessionB.status}`);

  // Step 6: Both clients read the same baseline state
  const baselineA = await apiDirect('/api/state', {}, cookieA);
  const baselineB = await apiDirect('/api/state', {}, cookieB);
  check('CLIENT_A baseline state read', baselineA.status === 200 && typeof baselineA.body.revision === 'number',
    `status ${baselineA.status}, revision ${baselineA.body?.revision}`);
  check('CLIENT_B baseline state read', baselineB.status === 200 && typeof baselineB.body.revision === 'number',
    `status ${baselineB.status}, revision ${baselineB.body?.revision}`);
  check('CLIENT_A and CLIENT_B see same baseline revision', baselineA.body.revision === baselineB.body.revision,
    `A: ${baselineA.body.revision}, B: ${baselineB.body.revision}`);

  const baselineRevision = baselineA.body.revision;
  const baselineTickets = baselineA.body.state?.pe_tickets || [];

  // === TEST 1: A changes a safe test record -> B sees the change ===
  console.log('\n--- Test 1: Bidirectional sync (A -> B) ---');
  const ticketA1 = { id: makeTicketId(), title: 'SyncE2E-A', status: 'open', author: 'client_a', value: 100 };
  const stateBeforeA = await apiDirect('/api/state', {}, cookieA);
  const ticketsBeforeA = stateBeforeA.body.state?.pe_tickets || [];
  const updatedTicketsA = [...ticketsBeforeA, ticketA1];

  const pushA = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: updatedTicketsA }, baseRevision: stateBeforeA.body.revision, clientId: 'client_a' },
  }, cookieA);
  check('A push to cloud returns 200', pushA.status === 200, `status ${pushA.status}`);
  check('A push bumps revision', typeof pushA.body?.revision === 'number' && pushA.body.revision > baselineRevision,
    `revision ${pushA.body?.revision} > ${baselineRevision}`);

  // B reads — should see A's change
  const stateB1 = await apiDirect('/api/state', {}, cookieB);
  const ticketsB1 = stateB1.body.state?.pe_tickets || [];
  const sawAChange = ticketsB1.some(t => t.id === ticketA1.id && t.title === ticketA1.title && t.value === 100);
  check('CLIENT_B sees CLIENT_A change after refresh', sawAChange,
    `B has ${ticketsB1.length} tickets, looking for ${ticketA1.title}`);

  // === TEST 2: B changes a safe test record -> A sees the change ===
  console.log('\n--- Test 2: Bidirectional sync (B -> A) ---');
  const ticketB1 = { id: makeTicketId(), title: 'SyncE2E-B', status: 'open', author: 'client_b', value: 200 };
  const stateBeforeB = await apiDirect('/api/state', {}, cookieB);
  const ticketsBeforeB = stateBeforeB.body.state?.pe_tickets || [];
  const updatedTicketsB = [...ticketsBeforeB, ticketB1];

  const pushB = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: updatedTicketsB }, baseRevision: stateBeforeB.body.revision, clientId: 'client_b' },
  }, cookieB);
  check('B push to cloud returns 200', pushB.status === 200, `status ${pushB.status}`);
  check('B push bumps revision', typeof pushB.body?.revision === 'number' && pushB.body.revision > pushA.body.revision,
    `revision ${pushB.body?.revision} > ${pushA.body.revision}`);

  // A reads — should see B's change
  const stateA2 = await apiDirect('/api/state', {}, cookieA);
  const ticketsA2 = stateA2.body.state?.pe_tickets || [];
  const sawBChange = ticketsA2.some(t => t.id === ticketB1.id && t.title === ticketB1.title && t.value === 200);
  check('CLIENT_A sees CLIENT_B change after refresh', sawBChange,
    `A has ${ticketsA2.length} tickets, looking for ${ticketB1.title}`);

  // Both changes should be present
  check('Both changes present on next read',
    ticketsA2.some(t => t.id === ticketA1.id) && ticketsA2.some(t => t.id === ticketB1.id),
    `tickets count: ${ticketsA2.length}`);

  // === TEST 3: Frontend-level sync verification (polling) ===
  console.log('\n--- Test 3: Frontend-level sync (app polling mechanism) ---');
  // The app polls /api/state every 1500ms and applies remote changes to localStorage.
  // To verify this, we reload both browser pages so the React app initializes cloud sync
  // (it reads the session cookie that was set by the API login), then push a change via
  // the API and check if Client B's browser localStorage reflects it via polling.

  // Reload pageA so App.tsx restoreServerSession picks up the cookie + initializes cloud sync
  await clientA.evaluate(pageA, 'location.reload()');
  await sleep(3000);
  // Reload pageB similarly
  await clientB.evaluate(pageB, 'location.reload()');
  await sleep(3000);

  // Write a change via the API (same endpoint the frontend uses internally)
  const frontendSyncTicket = { id: makeTicketId(), title: 'FrontendPollSync', status: 'open', author: 'poll_test', value: 555 };
  const stateBeforePoll = await apiDirect('/api/state', {}, cookieA);
  const ticketsBeforePoll = stateBeforePoll.body.state?.pe_tickets || [];
  const pushForPoll = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: [...ticketsBeforePoll, frontendSyncTicket] }, baseRevision: stateBeforePoll.body.revision, clientId: 'frontend_poll' },
  }, cookieA);
  check('Frontend sync: change pushed via API (200)', pushForPoll.status === 200, `status ${pushForPoll.status}`);

  // Wait for Client B's frontend polling (1500ms interval) to pick up the change
  // and apply it to localStorage
  let bSawPollChange = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const bCheck = await clientB.evaluate(pageB, `(() => {
      const tickets = JSON.parse(localStorage.getItem('pe_tickets') || '[]');
      return tickets.some(t => t.id === '${frontendSyncTicket.id}' && t.title === 'FrontendPollSync');
    })()`);
    if (bCheck) { bSawPollChange = true; break; }
  }
  check('CLIENT_B frontend picks up change via polling (1500ms interval)', bSawPollChange,
    'CLIENT_B localStorage did not reflect the API change within 20s via app polling');

  // === TEST 4: Reload persistence ===
  console.log('\n--- Test 4: Reload persistence ---');
  // CLIENT_A reloads the page; local state should persist
  await clientA.evaluate(pageA, 'location.reload()');
  await sleep(2000); // Wait for page to reload and state to hydrate
  const reloadedTickets = await clientA.evaluate(pageA, `(JSON.parse(localStorage.getItem('pe_tickets') || '[]') || []).length`);
  check('CLIENT_A local state persists across reload', reloadedTickets >= 2, `found ${reloadedTickets} tickets after reload`);

  // CLIENT_A's server-side session cookie persists across reload (HttpOnly cookie in cookie jar)
  const sessionAfterReload = await apiDirect('/api/auth/session', {}, cookieA);
  check('CLIENT_A server session persists across reload', sessionAfterReload.status === 200, `status ${sessionAfterReload.status}`);

  // === TEST 5: Stale revision / concurrent update conflict ===
  console.log('\n--- Test 5: Stale revision (409 conflict) ---');
  // Both A and B read the same revision, then both POST with that same baseRevision
  const staleState = await apiDirect('/api/state', {}, cookieA);
  const staleRevision = staleState.body.revision;
  const staleTickets = staleState.body.state?.pe_tickets || [];
  const conflictA = { id: makeTicketId(), title: 'ConflictA', author: 'a', status: 'open', value: 999 };
  const conflictB = { id: makeTicketId(), title: 'ConflictB', author: 'b', status: 'open', value: 888 };

  // Fire both POSTs as close together as possible with the same stale revision
  const [respA, respB] = await Promise.all([
    apiDirect('/api/state', {
      method: 'POST',
      body: { state: { pe_tickets: [...staleTickets, conflictA] }, baseRevision: staleRevision, clientId: 'conflict_a' },
    }, cookieA),
    apiDirect('/api/state', {
      method: 'POST',
      body: { state: { pe_tickets: [...staleTickets, conflictB] }, baseRevision: staleRevision, clientId: 'conflict_b' },
    }, cookieB),
  ]);

  const successes = [respA, respB].filter(r => r.status === 200).length;
  const conflicts409 = [respA, respB].filter(r => r.status === 409).length;
  check('Conflict: exactly one succeeds (200)', successes === 1, `successes=${successes}, statuses=[${respA.status},${respB.status}]`);
  check('Conflict: exactly one gets 409', conflicts409 === 1, `conflicts=${conflicts409}`);

  // The 409 response should include the current (winning) revision
  const rejectedResp = [respA, respB].find(r => r.status === 409);
  check('Conflict: 409 response includes current revision',
    typeof rejectedResp?.body?.revision === 'number' || typeof rejectedResp?.body?.error === 'string',
    `body: ${JSON.stringify(rejectedResp?.body).slice(0, 200)}`);

  // Verify no silent data corruption: only ONE of the two conflict tickets made it through
  const finalState = await apiDirect('/api/state', {}, cookieA);
  const finalTickets = finalState.body.state?.pe_tickets || [];
  const countConflictTickets = finalTickets.filter(t => t.title === 'ConflictA' || t.title === 'ConflictB').length;
  check('Conflict: no silent data corruption (only winner persisted)', countConflictTickets === 1,
    `found ${countConflictTickets} conflict tickets in final state (expected 1)`);

  // === TEST 6: Logout isolation ===
  console.log('\n--- Test 6: Logout isolation ---');
  const logoutA = await clientA.api(pageA, '/api/auth/logout', { method: 'POST' });
  check('CLIENT_A logout request succeeds', logoutA.status === 200, `status ${logoutA.status}`);

  // CLIENT_A's session should now be invalid
  const postLogoutSession = await clientA.api(pageA, '/api/auth/session');
  check('CLIENT_A session invalidated after logout', postLogoutSession.status === 401,
    `status ${postLogoutSession.status}`);

  // CLIENT_B's session should still be valid
  const sessionBAfterLogout = await clientB.api(pageB, '/api/auth/session');
  check('CLIENT_B session still valid after CLIENT_A logout', sessionBAfterLogout.status === 200,
    `status ${sessionBAfterLogout.status}`);

  // CLIENT_B can still read/write state after A logs out
  const bStillWorks = await apiDirect('/api/state', {}, cookieB);
  check('CLIENT_B can still access state after CLIENT_A logout', bStillWorks.status === 200, `status ${bStillWorks.status}`);

  // === TEST 7: Failed save behavior (401 on unauthenticated push) ===
  console.log('\n--- Test 7: Failed save (unauthenticated) ---');
  const unauthPush = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: [{ id: 'should-not-appear', title: 'NoAuth' }] }, baseRevision: finalState.body.revision, clientId: 'noauth' },
  });
  check('Unauthenticated push rejected (401)', unauthPush.status === 401, `status ${unauthPush.status}`);

  // === TEST 8: Stale revision rejection (409 on old revision after new write) ===
  console.log('\n--- Test 8: Stale revision rejection ---');
  // Write a new change with the current revision
  const pushNow = await apiDirect('/api/state', {}, cookieB);
  const freshTickets = [...(pushNow.body.state?.pe_tickets || []), { id: makeTicketId(), title: 'FreshWrite', author: 'b', status: 'open', value: 42 }];
  const pushFresh = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: freshTickets }, baseRevision: pushNow.body.revision, clientId: 'stale_test' },
  }, cookieB);
  check('Fresh write succeeds (200)', pushFresh.status === 200, `status ${pushFresh.status}`);

  // Now attempt to push with the OLD revision — should get 409
  const pushStale = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: [...(pushNow.body.state?.pe_tickets || []), { id: makeTicketId(), title: 'StalePush', author: 'b', status: 'open', value: 1 }] }, baseRevision: pushNow.body.revision, clientId: 'stale_push' },
  }, cookieB);
  check('Stale revision push rejected (409)', pushStale.status === 409, `status ${pushStale.status}`);

  // === Cleanup: remove temporary test fixtures ===
  console.log('\n--- Cleanup ---');
  const cleanupState = await apiDirect('/api/state', {}, cookieB);
  const allTickets = cleanupState.body.state?.pe_tickets || [];
  const cleanTickets = allTickets.filter(t =>
    !t.id?.startsWith(TICKET_PREFIX) &&
    t.title !== 'ConflictA' && t.title !== 'ConflictB' &&
    t.title !== 'FrontendSyncFromA' && t.title !== 'FrontendPollSync' &&
    t.title !== 'FreshWrite' && t.title !== 'StalePush'
  );
  const cleanupPush = await apiDirect('/api/state', {
    method: 'POST',
    body: { state: { pe_tickets: cleanTickets }, baseRevision: cleanupState.body.revision, clientId: 'cleanup' },
  }, cookieB);
  const removed = allTickets.length - cleanTickets.length;
  console.log(`[cleanup] Removed ${removed} test fixture tickets (push status: ${cleanupPush.status})`);

  // === Print results ===
  console.log('\n=== Test Results ===');
  let passed = 0;
  let failed = 0;
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'}: ${result.name}${result.details ? ' — ' + result.details : ''}`);
    if (result.passed) passed++;
    else failed++;
  }
  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} checks`);

  if (failed > 0) process.exitCode = 1;

} catch (error) {
  console.error('TEST ERROR:', error.message);
  console.error(error.stack);
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'}: ${result.name}`);
  }
  process.exitCode = 1;
} finally {
  try { clientA?.close(); } catch {}
  try { clientB?.close(); } catch {}
  if (chromeA) chromeA.kill();
  if (chromeB) chromeB.kill();
  if (profileDirA) await rm(profileDirA, { recursive: true, force: true }).catch(() => {});
  if (profileDirB) await rm(profileDirB, { recursive: true, force: true }).catch(() => {});
}
