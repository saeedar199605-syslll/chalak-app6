import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

// Called only by the disposable local Pages fixture runner. No production URLs.
export async function verifyPasswordFrontend(base, originalPassword) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const profile = await mkdtemp(path.join(tmpdir(), 'chalak-password-browser-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9334', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let socket;
  let id = 0;
  const pending = new Map();
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const call = ++id;
    const timer = setTimeout(() => { pending.delete(call); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(call, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
    socket.send(JSON.stringify({ id: call, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Browser scenario evaluation failed');
    return result.result.value;
  };
  const wait = async (expression, label) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Browser scenario timeout: ${label}`);
  };
  const clickText = text => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}));
    if (!button) throw new Error('Button unavailable'); button.click();
  })()`);
  const fill = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Input unavailable');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const submit = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('form').requestSubmit()`);
  const custom = 'input[placeholder="کلمه عبور جدید همکار را وارد کنید..."]';
  const current = 'input[placeholder="کلمه عبور فعلی..."]';
  const next = 'input[placeholder="کلمه عبور جدید..."]';
  const fixture = label => ['Local', 'Fixture', label, 937, '!'].join('-');
  const secrets = [originalPassword, fixture('custom'), fixture('admin')];
  const api = async (route, body, cookie) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() };
  };
  const checkStorage = async () => {
    const clean = await evaluate(`(async () => {
      const values = [JSON.stringify(localStorage), JSON.stringify(sessionStorage), JSON.stringify(window.__passwordAudit)];
      for (const item of await indexedDB.databases()) {
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open(item.name); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
        for (const store of db.objectStoreNames) {
          const data = await new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
          values.push(JSON.stringify(data));
        }
        db.close();
      }
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) values.push(await (await cache.match(request)).text());
      }
      return !${JSON.stringify(secrets)}.some(secret => values.some(value => value.includes(secret))) &&
        !localStorage.getItem('pe_admin_password') && !sessionStorage.getItem('pe_admin_password');
    })()`);
    assert.ok(clean, 'No password in browser persistence or captured writes/logs');
  };
  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try { target = (await (await fetch('http://127.0.0.1:9334/json/list')).json()).find(t => t.type === 'page'); if (target) break; } catch {}
      await sleep(100);
    }
    assert.ok(target, 'Local browser started');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      const request = pending.get(message.id);
      if (request) { pending.delete(message.id); if (message.error) request.reject(new Error('CDP command failed')); else request.resolve(message.result); }
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('pe_onboarded_emp-admin', 'true');
      localStorage.setItem('pe_tour_completed_emp-admin_admin', 'true');
      localStorage.setItem('pe_last_tab_emp-admin_admin', 'settings');
      localStorage.setItem('pe_admin_password', ${JSON.stringify(originalPassword)});
      sessionStorage.setItem('pe_admin_password', ${JSON.stringify(originalPassword)});
      window.__passwordAudit = [];
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) { window.__passwordAudit.push([k,v]); return write.call(this,k,v); };
      for (const name of ['log','warn','error']) {
        const original = console[name]; console[name] = (...args) => { window.__passwordAudit.push(args); original.apply(console,args); };
      }
    ` });
    await command('Page.navigate', { url: base });
    await wait(`!!document.querySelector('form')`, 'login form');
    await checkStorage();
    await clickText('پرتال مدیریت');
    await fill('form input[type="text"]', 'admin');
    await fill('form input[type="password"]', originalPassword);
    await submit('form input[type="password"]');
    await wait(`!!document.querySelector(${JSON.stringify(current)})`, 'management password panel');
    await wait(`document.body.innerText.includes('Password Fixture')`, 'fixture employee');
    console.log('Frontend admin login and legacy cleanup: PASS');

    const employeeBefore = await api('/api/auth/login', { username: 'password-fixture', password: originalPassword });
    assert.equal(employeeBefore.status, 200);
    const generate = () => evaluate(`(() => {
      const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('password-fixture'));
      row.querySelector('button[title*="تولید"]').click();
    })()`);
    await generate();
    await wait(`!!document.querySelector(${JSON.stringify(custom)})?.value`, 'generated handoff');
    const generated = await evaluate(`document.querySelector(${JSON.stringify(custom)}).value`);
    secrets.push(generated);
    assert.equal((await api('/api/auth/login', { username: 'password-fixture', password: generated })).status, 200);
    assert.equal((await api('/api/auth/login', { username: 'password-fixture', password: originalPassword })).status, 401);
    assert.equal((await api('/api/auth/session', null, employeeBefore.cookie)).status, 401);
    await checkStorage();
    await clickText('انصراف');
    assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(custom)})`));
    console.log('Frontend generated handoff, close, login and invalidation: PASS');

    const openEditor = () => evaluate(`(() => {
      const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('password-fixture'));
      row.querySelector('button[title*="تغییر کلمه"]').click();
    })()`);
    await openEditor();
    await fill(custom, fixture('custom'));
    await submit(custom);
    await wait(`!document.querySelector(${JSON.stringify(custom)})`, 'custom change completion');
    assert.equal((await api('/api/auth/login', { username: 'password-fixture', password: fixture('custom') })).status, 200);
    await checkStorage();
    console.log('Frontend custom password change and cleanup: PASS');

    await evaluate(`window.__realFetch = window.fetch.bind(window)`);
    for (const [body, status, message] of [
      ['<html>failure</html>', 200, 'Invalid response'],
      ['{}', 200, 'Operation failed'],
      ['{"success":false}', 200, 'Operation failed'],
      ['{}', 500, 'سرویس امن کلمه عبور'],
    ]) {
      await evaluate(`window.fetch = (url, options) => String(url).includes('/api/auth/password') && options?.method === 'POST'
        ? Promise.resolve(new Response(${JSON.stringify(body)}, { status: ${status} })) : window.__realFetch(url, options)`);
      await openEditor();
      await fill(custom, fixture('custom'));
      await submit(custom);
      await wait(`document.body.innerText.includes(${JSON.stringify(message)})`, 'safe failure feedback');
      assert.ok(await evaluate(`document.querySelector(${JSON.stringify(custom)}).value === ''`));
      await checkStorage();
      await clickText('انصراف');
    }
    // Delay a valid reply until after cancellation; it must not recreate a handoff.
    await evaluate(`window.fetch = (url, options) => String(url).includes('/api/auth/password') && options?.method === 'POST'
      ? new Promise(resolve => { window.__finishPassword = () => resolve(Response.json({success:true})); }) : window.__realFetch(url, options)`);
    await generate();
    await wait(`typeof window.__finishPassword === 'function'`, 'pending generation');
    await clickText('انصراف');
    await evaluate(`window.__finishPassword()`);
    await sleep(100);
    assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(custom)})`));
    await evaluate(`window.fetch = window.__realFetch`);
    console.log('Frontend malformed/HTTP/explicit failure and late cancellation: PASS');

    await generate();
    await wait(`!!document.querySelector(${JSON.stringify(custom)})?.value`, 'handoff before panel change');
    secrets.push(await evaluate(`document.querySelector(${JSON.stringify(custom)}).value`));
    await fill(current, originalPassword);
    await clickText('دسترسی‌ها و ماتریس');
    await clickText('مدیریت کلمه عبور و امنیت');
    assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(custom)}) && document.querySelector(${JSON.stringify(current)}).value === ''`));
    await checkStorage();
    console.log('Frontend security-panel lifecycle cleanup: PASS');

    await fill(current, originalPassword);
    await fill(next, fixture('admin'));
    const confirmSelector = await evaluate(`(() => {
      const inputs = [...document.querySelector(${JSON.stringify(current)}).closest('form').querySelectorAll('input')];
      return 'input[placeholder="' + inputs[2].placeholder + '"]';
    })()`);
    await fill(confirmSelector, fixture('admin'));
    await submit(current);
    await wait(`!document.querySelector(${JSON.stringify(current)})`, 'admin reauthentication');
    const changedAdmin = await api('/api/auth/login', { username: 'admin', password: fixture('admin') });
    assert.equal(changedAdmin.status, 200);
    assert.equal((await api('/api/auth/login', { username: 'admin', password: originalPassword })).status, 401);
    await checkStorage();
    console.log('Frontend admin password change, cleanup and reauthentication: PASS');

    // Restore only this runner's isolated fake credentials for its hash checks.
    assert.equal((await api('/api/auth/password', { username: 'password-fixture', password: originalPassword }, changedAdmin.cookie)).status, 200);
    assert.equal((await api('/api/auth/password', { username: 'admin', currentPassword: fixture('admin'), password: originalPassword }, changedAdmin.cookie)).status, 200);
  } finally {
    socket?.close();
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
    // Delete only the unique browser profile created by this invocation.
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(tmpdir()));
    assert.ok(path.basename(profile).startsWith('chalak-password-browser-'));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}
