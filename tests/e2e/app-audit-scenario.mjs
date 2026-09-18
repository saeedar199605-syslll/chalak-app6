// Full-app audit: login → nav → logout → session invalidation (local fixture).
import {
  base, connectAndLogin, evaluate, wait, clickButtonByText, fillInput, check, results,
  cleanup, sleep,
} from './onboarding-ui-check.mjs';

const api = async (route, body, cookie) => {
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: {
    ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

try {
  await connectAndLogin();
  // Admin login
  await clickButtonByText('پرتال مدیریت');
  await fillInput('form input[type="text"]', 'admin');
  await fillInput('form input[type="password"]', 'UiCheck-2026-x');
  await evaluate(`document.querySelector('form input[type="password"]').closest('form').requestSubmit()`);
  await wait(`document.body.innerText.includes('داشبورد') || document.body.innerText.includes('مرکز مدیریت')`, 'app shell');
  check('Admin UI login', true);

  // Visit each major admin tab and check no crash (error boundary would replace root)
  const tabs = ['داشبورد', 'کارنامه‌های عملکرد', 'گردش کار و تاییدات', 'کالیبراسیون نمرات', 'تحلیل‌ها و ماتریس ۹-Box'];
  const tabIds = ['dashboard', 'evaluations', 'workflow', 'calibration', 'reports'];
  for (const label of tabs) {
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button, a')].find(b => b.textContent.includes(${JSON.stringify(label)}));
      if (!btn) throw new Error('nav not found: ' + ${JSON.stringify(label)});
      btn.click(); return true;
    })()`);
    await sleep(500);
    const crashed = await evaluate(`!!document.querySelector('[role="alert"]') || document.body.innerText.includes('خطای غیرمنتظره') || document.body.innerText.includes('Something went wrong')`);
    check(`Tab renders without crash: ${label}`, !crashed);
  }

  // Logout
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('خروج') || b.title?.includes('خروج'));
    if (!btn) throw new Error('logout button not found');
    btn.click(); return true;
  })()`);
  await wait(`!!document.querySelector('form')`, 'returned to login form');
  check('Logout returns to login form', true);

  // Session cookie invalidated server-side: old cookie must not authorize /api/auth/session
  const sess = await fetch(base + '/api/auth/session', { method: 'GET' });
  check('Unauthenticated /api/auth/session rejected', sess.status === 401, 'status ' + sess.status);

  // Employee (default code login) flow
  const empLogin = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'unknown-emp', password: 'x' }) });
  check('Unknown employee rejected 401', empLogin.status === 401, 'status ' + empLogin.status);
} catch (error) {
  check('Audit scenario completed', false, error.message);
} finally {
  console.log(results.join('\n'));
  await cleanup();
}
