import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import assert from 'node:assert/strict';
import { generateSecurePassword } from './src/utils/password.ts';
import { verifyPasswordFrontend } from './tests/e2e/password-frontend.mjs';

// Disposable local-only fixtures. Passwords and session tokens never reach output.
const root = await mkdtemp(path.join(tmpdir(), 'chalak-password-check-'));
const namespace = '4f2179fbe74b4e379556b6fb53337f2e';
const options = convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("fixture"); } }', kvNamespaces: { CHALAK_DB: namespace }, resourcePersistencePath: path.join(root, 'v3') });
const secret = () => randomBytes(24).toString('base64url');
const adminPassword = secret(), employeePassword = secret(), newPassword = generateSecurePassword();
const hash = password => {
  const salt = randomBytes(16), iterations = 100000;
  return JSON.stringify({ salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64'), iterations });
};
let mf = new Miniflare(options);
let kv = await mf.getKVNamespace('CHALAK_DB');
await kv.put('credential:admin', hash(adminPassword));
await kv.put('credential:password-fixture', hash(employeePassword));
await kv.put('app_state', JSON.stringify({ pe_employees: [{ id: 'password-fixture', username: 'password-fixture', name: 'Password Fixture', code: 'fixture-code', role: 'employee' }] }));
await mf.dispose();
// Use cf:dev's Pages command with its already-built dist and isolated storage.
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '8791', '--persist-to', root, '--binding', 'ADMIN_PASSWORD=unused-fixture-bootstrap'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
let logs = '';
child.stdout.on('data', data => { logs += data; });
child.stderr.on('data', data => { logs += data; });
const base = 'http://127.0.0.1:8791';
const request = async (route, body, cookie) => {
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, json, cookie: response.headers.get('set-cookie')?.split(';')[0], text };
};
const check = (label, response, expected) => { console.log(`${label}: HTTP ${response.status}`); assert.equal(response.status, expected, label); };
let failure;
try {
  const deadline = Date.now() + 90000;
  while (!logs.includes('Ready on')) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error('Password fixture runtime did not become ready');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.match(logs, /CHALAK_DB[^\n]*local/);
  check('Unauthenticated password route', await request('/api/auth/password'), 401);
  const admin = await request('/api/auth/login', { username: 'admin', password: adminPassword });
  check('Admin fixture login', admin, 200);
  check('Unknown employee produces application 404', await request('/api/auth/password', { username: 'missing-fixture', password: newPassword }, admin.cookie), 404);
  const employee = await request('/api/auth/login', { username: 'password-fixture', password: employeePassword });
  check('Employee old password login', employee, 200);
  check('Authenticated employee password change', await request('/api/auth/password', { username: 'password-fixture', password: newPassword }, admin.cookie), 200);
  check('New employee password login', await request('/api/auth/login', { username: 'password-fixture', password: newPassword }), 200);
  check('Old employee password rejected', await request('/api/auth/login', { username: 'password-fixture', password: employeePassword }), 401);
  check('Old employee session invalidated', await request('/api/auth/session', null, employee.cookie), 401);
  const changed = await request('/api/auth/password', { username: 'admin', currentPassword: adminPassword, password: newPassword }, admin.cookie);
  check('Admin password change', changed, 200);
  assert.equal(changed.json.reauthenticationRequired, true);
  check('New admin password login', await request('/api/auth/login', { username: 'admin', password: newPassword }), 200);
  check('Old admin password rejected', await request('/api/auth/login', { username: 'admin', password: adminPassword }), 401);
  check('Old admin session invalidated', await request('/api/auth/session', null, admin.cookie), 401);
  await verifyPasswordFrontend(base, newPassword);
} catch (error) { failure = error; console.error(error.message); }
finally {
  await new Promise(resolve => { const stop = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); stop.on('exit', resolve); });
}
for (const value of [adminPassword, employeePassword, newPassword]) assert.ok(!logs.includes(value), 'No plaintext password in runtime logs');
console.log('Runtime logs: no test passwords present');
if (failure && !logs.includes('Ready on')) console.log(logs.split('\n').filter(line => /ERROR|ENOENT|Error:/.test(line)).join('\n'));
const relevantError = logs.split('\n').filter(line => /iteration|PBKDF|NotSupported|OperationError/i.test(line));
for (const line of relevantError) console.log(line);
mf = new Miniflare(options);
try {
  kv = await mf.getKVNamespace('CHALAK_DB');
  for (const user of ['admin', 'password-fixture']) {
    const stored = await kv.get(`credential:${user}`);
    assert.ok(stored, 'Fixture credential exists');
    for (const value of [adminPassword, employeePassword, newPassword]) assert.ok(!stored.includes(value));
    const record = JSON.parse(stored);
    assert.ok(record.salt && record.hash && record.iterations);
    if (!failure) assert.equal(pbkdf2Sync(newPassword, Buffer.from(record.salt, 'base64'), record.iterations, 32, 'sha256').toString('base64'), record.hash);
  }
  console.log('Credential persistence: salted hashes only');
} finally { await mf.dispose(); }
if (failure) { console.error(failure.message); process.exitCode = 1; }
