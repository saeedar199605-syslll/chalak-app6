import { AuthSession, CloudflareEnv, jsonResponse } from '../../cloudflare/auth';
import { CloudState, sanitizeCloudState } from '../../cloudflare/syncState';

interface Context {
  request: Request;
  env: CloudflareEnv;
  data: { session?: AuthSession };
}

interface StateMeta {
  revision: number;
  updatedAt: string;
  updatedBy?: string;
  clientId?: string;
}

interface StateEnvelope {
  state?: unknown;
  baseRevision?: unknown;
  clientId?: unknown;
}

type EmployeeRecord = { id: string; username?: string; supervisorId?: string };
type EvaluationRecord = { id: string; empId: string };

async function readState(env: CloudflareEnv): Promise<{ state: CloudState; meta: StateMeta }> {
  const [rawState, rawMeta] = await Promise.all([
    env.CHALAK_DB.get('app_state'),
    env.CHALAK_DB.get('app_state_meta'),
  ]);
  let state: CloudState = {};
  let meta: StateMeta = { revision: 0, updatedAt: '' };
  try { state = rawState ? sanitizeCloudState(JSON.parse(rawState)) : {}; } catch { state = {}; }
  try {
    const parsed = rawMeta ? JSON.parse(rawMeta) as Partial<StateMeta> : {};
    meta = {
      revision: Number.isInteger(parsed.revision) && Number(parsed.revision) >= 0 ? Number(parsed.revision) : 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : undefined,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
    };
  } catch { /* legacy state starts at revision zero */ }
  return { state, meta };
}

function allowedEmployeeIds(state: CloudState, session: AuthSession): Set<string> {
  const employees = Array.isArray(state.pe_employees) ? state.pe_employees as EmployeeRecord[] : [];
  return new Set(
    employees
      .filter(employee => session.role === 'supervisor'
        ? employee.supervisorId === session.id || employee.id === session.id
        : employee.id === session.id)
      .map(employee => employee.id)
  );
}

function scopedState(state: CloudState, session: AuthSession): CloudState {
  if (session.role === 'admin') return state;
  const employees = Array.isArray(state.pe_employees) ? state.pe_employees as EmployeeRecord[] : [];
  const allowedIds = allowedEmployeeIds(state, session);
  const result: CloudState = { ...state };
  if (Array.isArray(state.pe_evaluations)) {
    result.pe_evaluations = (state.pe_evaluations as EvaluationRecord[]).filter(item => allowedIds.has(item.empId));
  }
  result.pe_employees = employees.filter(employee => allowedIds.has(employee.id));
  for (const key of [
    'pe_reward_config', 'pe_reward_batch_history', 'pe_system_logs', 'pe_audit_logs',
    'pe_role_permissions', 'pe_user_custom_permissions', 'pe_locked_users',
  ]) delete result[key];
  return sanitizeCloudState(result);
}

function mergeAuthorizedState(current: CloudState, changes: CloudState, session: AuthSession): CloudState {
  if (session.role === 'admin') return sanitizeCloudState({ ...current, ...changes });
  const next = { ...current };
  const allowedIds = allowedEmployeeIds(current, session);
  if (Array.isArray(changes.pe_evaluations)) {
    const currentEvaluations = Array.isArray(current.pe_evaluations) ? current.pe_evaluations as EvaluationRecord[] : [];
    const incoming = (changes.pe_evaluations as EvaluationRecord[]).filter(item => item?.id && allowedIds.has(item.empId));
    const byId = new Map(currentEvaluations.map(item => [item.id, item]));
    incoming.forEach(item => byId.set(item.id, item));
    next.pe_evaluations = Array.from(byId.values());
  }
  for (const key of ['pe_lattice_okrs', 'pe_lattice_one_on_ones', 'pe_lattice_kudos', 'pe_tickets']) {
    if (key in changes) next[key] = changes[key];
  }
  return sanitizeCloudState(next);
}

function responseEnvelope(state: CloudState, meta: StateMeta, session: AuthSession): Response {
  return jsonResponse({ state: scopedState(state, session), ...meta });
}

export async function onRequestGet({ env, data }: Context): Promise<Response> {
  if (!data.session) return jsonResponse({ error: 'Authentication required.' }, 401);
  const { state, meta } = await readState(env);
  return responseEnvelope(state, meta, data.session);
}

export async function onRequestPost({ request, env, data }: Context): Promise<Response> {
  if (!data.session) return jsonResponse({ error: 'Authentication required.' }, 401);
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
  }
  const text = await request.text();
  if (text.length > 5_000_000) return jsonResponse({ error: 'Payload is too large.' }, 413);

  let body: StateEnvelope;
  try { body = JSON.parse(text) as StateEnvelope; }
  catch { return jsonResponse({ error: 'Invalid JSON payload.' }, 400); }

  const changes = sanitizeCloudState(body.state === undefined ? body : body.state);
  if (Object.keys(changes).length === 0) return jsonResponse({ error: 'No synchronized changes were supplied.' }, 400);

  const { state: current, meta: currentMeta } = await readState(env);
  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision !== currentMeta.revision) {
    return jsonResponse({
      error: 'داده ابری در مرورگر دیگری تغییر کرده است؛ آخرین نسخه دریافت و ذخیره دوباره انجام شود.',
      revision: currentMeta.revision,
      updatedAt: currentMeta.updatedAt,
    }, 409);
  }
  const next = mergeAuthorizedState(current, changes, data.session);
  const meta: StateMeta = {
    revision: currentMeta.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: data.session.username,
    clientId: typeof body.clientId === 'string' ? body.clientId.slice(0, 80) : undefined,
  };
  await env.CHALAK_DB.put('app_state', JSON.stringify(next));
  await env.CHALAK_DB.put('app_state_meta', JSON.stringify(meta));
  return responseEnvelope(next, meta, data.session);
}

export function onRequest(): Response {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
}
