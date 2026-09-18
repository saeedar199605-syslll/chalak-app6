import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';

const APP_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8788';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'LocalE2E-Admin-937!';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9333;

const profileDir = await mkdtemp(path.join(tmpdir(), 'chalak-e2e-'));
const chrome = spawn(CHROME_PATH, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' });

let socket;
let nextId = 1;
const pending = new Map();
const events = new Map();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retry(fn, attempts = 80) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try { return await fn(); }
    catch (error) { lastError = error; await sleep(100); }
  }
  throw lastError;
}

async function command(method, params = {}, sessionId) {
  const id = nextId++;
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return response;
}

function waitForEvent(method, sessionId, timeoutMs = 10_000) {
  const key = `${sessionId || ''}:${method}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
    events.set(key, message => { clearTimeout(timer); events.delete(key); resolve(message.params); });
  });
}

async function createPage() {
  const { browserContextId } = await command('Target.createBrowserContext');
  const { targetId } = await command('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Runtime.enable', {}, sessionId);
  await command('Page.enable', {}, sessionId);
  return { browserContextId, sessionId };
}

async function evaluate(page, expression, awaitPromise = true) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, page.sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result.value;
}

async function navigate(page, url = APP_URL) {
  const loaded = waitForEvent('Page.loadEventFired', page.sessionId);
  await command('Page.navigate', { url }, page.sessionId);
  await loaded;
}

async function waitFor(page, expression, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(page, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function api(page, pathName, options = {}) {
  return evaluate(page, `(async () => {
    const response = await fetch(${JSON.stringify(pathName)}, ${JSON.stringify(options)});
    let body = null;
    try { body = await response.json(); } catch {}
    return { status: response.status, body };
  })()`);
}

async function login(page) {
  const result = await api(page, '/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
  });
  if (result.status !== 200) throw new Error(`Admin login failed: ${JSON.stringify(result)}`);
  return result.body.user;
}

const results = [];
function check(name, condition, details) {
  results.push({ name, passed: Boolean(condition), details });
  if (!condition) throw new Error(`${name}: ${details}`);
}

try {
  const version = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (!response.ok) throw new Error('Chrome CDP is not ready');
    return response.json();
  });

  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
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

  const first = await createPage();
  await navigate(first);
  const adminUser = await login(first);
  check('admin login', adminUser?.role === 'admin', JSON.stringify(adminUser));

  await evaluate(first, `sessionStorage.setItem('pe_session_user', ${JSON.stringify(JSON.stringify({
    id: 'emp-admin', name: 'Admin', username: 'admin', code: 'ADMIN-001', role: 'admin', profileId: 'prof-3', unit: 'HQ',
  }))}); localStorage.setItem('pe_onboarded_emp-admin', 'true'); localStorage.setItem('pe_tour_completed_emp-admin_admin', 'true'); localStorage.setItem('pe_last_tab_emp-admin_admin', 'employees');`);
  await navigate(first);
  await waitFor(first, `document.body && !document.body.innerText.includes('secure session')`, 15_000).catch(() => {});
  const restoredTab = await evaluate(first, `localStorage.getItem('pe_last_tab_emp-admin_admin')`);
  check('navigation survives reload', restoredTab === 'employees', `stored tab after reload: ${restoredTab}`);

  const passwordRoute = await api(first, '/api/auth/password', { credentials: 'same-origin' });
  check('password API route', passwordRoute.status === 200, JSON.stringify(passwordRoute));

  const state = await retry(async () => {
    const response = await api(first, '/api/state', { credentials: 'same-origin' });
    if (response.status !== 200 || !Array.isArray(response.body?.state?.pe_employees)) throw new Error('Seed state has not synced yet');
    return response;
  }, 120);
  check('cloud state sync', Number.isInteger(state.body.revision), `revision ${state.body.revision}`);

  const originalEmployees = state.body.state.pe_employees;
  const employee = {
    id: 'emp-e2e-local-only',
    name: 'Local E2E Employee',
    username: 'e2e.local.employee',
    code: 'E2E-937',
    role: 'employee',
    profileId: 'prof-1',
    unit: 'E2E',
  };
  const employeeCreate = await api(first, '/api/state', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: { pe_employees: [...originalEmployees.filter(item => item.id !== employee.id), employee] },
      baseRevision: state.body.revision,
      clientId: 'local-e2e',
    }),
  });
  check('employee fixture creation', employeeCreate.status === 200, `status ${employeeCreate.status}, revision ${employeeCreate.body?.revision}`);
  const passwordSet = await api(first, '/api/auth/password', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: employee.username, password: 'Local-E2E-Temp-937!' }),
  });
  check('employee password change', passwordSet.status === 200, JSON.stringify(passwordSet));
  const passwordReset = await api(first, '/api/auth/password', {
    method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: employee.username }),
  });
  check('employee password reset', passwordReset.status === 200, JSON.stringify(passwordReset));

  const employeeDelete = await api(first, '/api/state', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: { pe_employees: originalEmployees },
      baseRevision: employeeCreate.body.revision,
      clientId: 'local-e2e',
    }),
  });
  check(
    'employee deletion persists',
    employeeDelete.status === 200 && !employeeDelete.body.state.pe_employees.some(item => item.id === employee.id),
    `status ${employeeDelete.status}, revision ${employeeDelete.body?.revision}`,
  );

  const refreshControl = await evaluate(first, `(async () => {
    window.__e2eAlert = null;
    window.alert = message => { window.__e2eAlert = String(message); };
    const button = [...document.querySelectorAll('button')].find(item =>
      (item.textContent || '').includes('\u0647\u0645\u06af\u0627\u0645') ||
      (item.textContent || '').includes('\u062a\u0627\u0632\u0647\u200c\u0633\u0627\u0632\u06cc')
    );
    if (!button) return { found: false };
    button.click();
    await new Promise(resolve => setTimeout(resolve, 2500));
    return { found: true, disabled: button.disabled, alert: window.__e2eAlert, text: button.textContent };
  })()`);
  check(
    'cloud refresh control',
    refreshControl.found && !refreshControl.disabled && !refreshControl.alert,
    JSON.stringify(refreshControl),
  );

  const second = await createPage();
  await navigate(second);
  await login(second);
  const firstSessionBefore = await api(first, '/api/auth/session', { credentials: 'same-origin' });
  const secondSessionBefore = await api(second, '/api/auth/session', { credentials: 'same-origin' });
  check('independent sessions established', firstSessionBefore.status === 200 && secondSessionBefore.status === 200, `${firstSessionBefore.status}/${secondSessionBefore.status}`);
  await api(first, '/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  const firstSessionAfter = await api(first, '/api/auth/session', { credentials: 'same-origin' });
  const secondSessionAfter = await api(second, '/api/auth/session', { credentials: 'same-origin' });
  check('logout isolation', firstSessionAfter.status === 401 && secondSessionAfter.status === 200, `${firstSessionAfter.status}/${secondSessionAfter.status}`);

  console.log(JSON.stringify({ passed: true, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: error.message, results }, null, 2));
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill();
  await Promise.race([exited, sleep(5_000)]);
  await rm(profileDir, { recursive: true, force: true });
}
