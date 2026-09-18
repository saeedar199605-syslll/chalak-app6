// UI verification of the redesigned Onboarding via CDP + system Chrome (local fixture only).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = 'http://127.0.0.1:8790';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('local only');
const profile = await mkdtemp(path.join(tmpdir(), 'chalak-onboard-ui-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9335', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, id = 0;
const pending = new Map();
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const call = ++id;
  const timer = setTimeout(() => { pending.delete(call); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
  pending.set(call, { resolve: v => { clearTimeout(timer); resolve(v); }, reject });
  socket.send(JSON.stringify({ id: call, method, params }));
});
const evaluate = async expression => {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error('Evaluate failed: ' + JSON.stringify(result.exceptionDetails).slice(0, 300));
  return result.result.value;
};
const wait = async (expression, label, tries = 100) => {
  for (let i = 0; i < tries; i++) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error('UI timeout: ' + label);
};
const clickButtonByText = text => evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}));
  if (!btn) throw new Error('Button not found: ' + ${JSON.stringify(text)});
  btn.click();
  return true;
})()`);
const fillInput = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) throw new Error('Input not found');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const results = [];
const check = (label, ok, extra = '') => { results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${extra ? ' — ' + extra : ''}`); if (!ok) process.exitCode = 1; };

export { base, chrome, sleep, command, evaluate, wait, clickButtonByText, fillInput, check, results, profile, rm };
export async function cleanup() {
  try { socket?.close(); } catch {}
  const exited = new Promise(r => chrome.once('exit', r));
  chrome.kill();
  await Promise.race([exited_r(), sleep(5000)]);
  function exited_r() { return new Promise(r => chrome.once('exit', r)); }
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
}
export async function connectAndLogin() {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9335/json/list')).json()).find(t => t.type === 'page'); if (target) break; } catch {}
    await sleep(100);
  }
  if (!target) throw new Error('Chrome did not start');
  const WebSocket = (await import('ws')).default;
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    const req = pending.get(message.id);
    if (req) { pending.delete(message.id); if (message.error) req.reject(new Error('CDP command failed: ' + message.error.message)); else req.resolve(message.result); }
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: base });
  await wait(`!!document.querySelector('form')`, 'login form');
}
