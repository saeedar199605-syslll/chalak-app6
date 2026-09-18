import {
  AuthSession,
  CloudflareEnv,
  hashPassword,
  jsonResponse,
  normalizeUsername,
  sessionCookie,
  verifyPassword,
} from '../../../cloudflare/auth';

interface Context {
  request: Request;
  env: CloudflareEnv;
  data: { session?: AuthSession };
}

type EmployeeRecord = { id: string; username?: string; code?: string };

async function readEmployees(env: CloudflareEnv): Promise<EmployeeRecord[]> {
  try {
    const raw = await env.CHALAK_DB.get('app_state');
    const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    return Array.isArray(state.pe_employees) ? state.pe_employees as EmployeeRecord[] : [];
  } catch {
    return [];
  }
}

async function bumpCredentialVersion(env: CloudflareEnv, username: string): Promise<number> {
  const key = `credential_version:${username}`;
  const next = Number(await env.CHALAK_DB.get(key) || '0') + 1;
  await env.CHALAK_DB.put(key, String(next));
  return next;
}

async function readCredentialIndex(env: CloudflareEnv): Promise<string[] | null> {
  try {
    const raw = await env.CHALAK_DB.get('credential_index');
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeUsername).filter(Boolean) : null;
  } catch { return null; }
}

async function writeCredentialIndex(env: CloudflareEnv, usernames: Iterable<string>): Promise<void> {
  await env.CHALAK_DB.put('credential_index', JSON.stringify(Array.from(new Set(usernames)).sort()));
}

export async function onRequestGet({ env, data }: Context): Promise<Response> {
  if (data.session?.role !== 'admin') return jsonResponse({ error: 'دسترسی مدیریت لازم است.' }, 403);
  let customUsernames = await readCredentialIndex(env);
  if (customUsernames === null) {
    const employees = await readEmployees(env);
    const statuses = await Promise.all(employees.map(async employee => {
      const username = normalizeUsername(employee.username);
      return [username, username ? Boolean(await env.CHALAK_DB.get(`credential:${username}`)) : false] as const;
    }));
    customUsernames = statuses.filter(([, exists]) => exists).map(([username]) => username);
    await writeCredentialIndex(env, customUsernames);
  }
  return jsonResponse({ customUsernames });
}

export async function onRequestPost({ request, env, data }: Context): Promise<Response> {
  if (data.session?.role !== 'admin') return jsonResponse({ error: 'دسترسی مدیریت لازم است.' }, 403);
  let body: { action?: unknown; username?: unknown; oldUsername?: unknown; password?: unknown; currentPassword?: unknown };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'درخواست تغییر رمز معتبر نیست.' }, 400); }

  const employees = await readEmployees(env);
  if (body.action === 'reset_all') {
    const usernames = employees
      .map(employee => normalizeUsername(employee.username))
      .filter(username => username && username !== 'admin');
    await Promise.all(usernames.map(async username => {
      await env.CHALAK_DB.delete(`credential:${username}`);
      await bumpCredentialVersion(env, username);
    }));
    await writeCredentialIndex(env, []);
    return jsonResponse({ success: true, resetCount: usernames.length });
  }

  if (body.action === 'rename') {
    const oldUsername = normalizeUsername(body.oldUsername);
    const newUsername = normalizeUsername(body.username);
    if (!oldUsername || !newUsername || oldUsername === 'admin' || newUsername === 'admin') {
      return jsonResponse({ error: 'نام کاربری قدیم یا جدید معتبر نیست.' }, 400);
    }
    const oldCredential = await env.CHALAK_DB.get(`credential:${oldUsername}`);
    if (oldCredential) await env.CHALAK_DB.put(`credential:${newUsername}`, oldCredential);
    await env.CHALAK_DB.delete(`credential:${oldUsername}`);
    await Promise.all([bumpCredentialVersion(env, oldUsername), bumpCredentialVersion(env, newUsername)]);
    const credentialIndex = await readCredentialIndex(env) || [];
    await writeCredentialIndex(
      env,
      oldCredential ? [...credentialIndex.filter(item => item !== oldUsername), newUsername] : credentialIndex.filter(item => item !== oldUsername)
    );
    return jsonResponse({ success: true, credentialMoved: Boolean(oldCredential) });
  }

  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  const minimumLength = 8;
  if (!username || password.length < minimumLength || password.length > 256) {
    return jsonResponse({ error: `کلمه عبور باید بین ${minimumLength} تا ۲۵۶ نویسه باشد.` }, 400);
  }

  if (username === 'admin') {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const stored = await env.CHALAK_DB.get('credential:admin');
    if (!stored && !env.ADMIN_PASSWORD) {
      return jsonResponse({ error: 'متغیر امن ADMIN_PASSWORD در Cloudflare تنظیم نشده است.' }, 503);
    }
    const currentValid = stored
      ? await verifyPassword(currentPassword, stored)
      : currentPassword === env.ADMIN_PASSWORD;
    if (!currentValid) return jsonResponse({ error: 'کلمه عبور فعلی مدیریت نادرست است.' }, 401);
  } else if (!employees.some(employee => normalizeUsername(employee.username) === username)) {
    return jsonResponse({ error: 'کاربر مورد نظر در پایگاه داده وجود ندارد.' }, 404);
  }

  await env.CHALAK_DB.put(`credential:${username}`, await hashPassword(password));
  await bumpCredentialVersion(env, username);
  const credentialIndex = await readCredentialIndex(env) || [];
  await writeCredentialIndex(env, [...credentialIndex, username]);
  if (username === 'admin') {
    return jsonResponse(
      { success: true, reauthenticationRequired: true },
      200,
      { 'Set-Cookie': sessionCookie('', 0, new URL(request.url).protocol === 'https:') }
    );
  }
  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, data }: Context): Promise<Response> {
  if (data.session?.role !== 'admin') return jsonResponse({ error: 'دسترسی مدیریت لازم است.' }, 403);
  let body: { username?: unknown };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'درخواست بازنشانی رمز معتبر نیست.' }, 400); }
  const username = normalizeUsername(body.username);
  if (!username || username === 'admin') return jsonResponse({ error: 'حساب مورد نظر قابل بازنشانی نیست.' }, 400);
  const employees = await readEmployees(env);
  if (!employees.some(employee => normalizeUsername(employee.username) === username)) {
    return jsonResponse({ error: 'کاربر مورد نظر در پایگاه داده وجود ندارد.' }, 404);
  }
  await env.CHALAK_DB.delete(`credential:${username}`);
  await bumpCredentialVersion(env, username);
  const credentialIndex = await readCredentialIndex(env) || [];
  await writeCredentialIndex(env, credentialIndex.filter(item => item !== username));
  return jsonResponse({ success: true });
}

export function onRequest(): Response {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' });
}
