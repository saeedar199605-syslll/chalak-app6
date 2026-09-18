import { describe, expect, it } from 'vitest';
import { CloudflareEnv, AuthSession } from '../cloudflare/auth';
import { onRequestGet, onRequestPost } from '../functions/api/state';
import { onRequestDelete as deletePassword, onRequestPost as postPassword } from '../functions/api/auth/password';

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

const admin: AuthSession = {
  id: 'emp-admin', name: 'Admin', username: 'admin', role: 'admin', expiresAt: Date.now() + 60_000,
};

function context(env: CloudflareEnv, session: AuthSession, body?: unknown) {
  return {
    request: new Request('https://example.test/api/state', body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    env,
    data: { session },
  };
}

describe('versioned cloud state', () => {
  it('merges changed keys without erasing data from another browser', async () => {
    const kv = new MemoryKv();
    const env = { CHALAK_DB: kv } as CloudflareEnv;
    const employees = [{ id: 'emp-1', username: 'one', code: 'E1', role: 'employee' }];

    const first = await onRequestPost(context(env, admin, {
      state: { pe_employees: employees, pe_criteria: [{ id: 'c1' }], pe_theme: 'dark' }, clientId: 'browser-a', baseRevision: 0,
    }));
    expect(first.status).toBe(200);

    const second = await onRequestPost(context(env, admin, {
      state: { pe_criteria: [{ id: 'c1' }, { id: 'c2' }] }, clientId: 'browser-b', baseRevision: 1,
    }));
    expect(second.status).toBe(200);
    const result = await second.json() as any;
    expect(result.revision).toBe(2);
    expect(result.state.pe_employees).toEqual(employees);
    expect(result.state.pe_criteria).toHaveLength(2);
    expect(result.state.pe_theme).toBeUndefined();

    const fetched = await onRequestGet(context(env, admin));
    expect((await fetched.json() as any).revision).toBe(2);
  });

  it('prevents employees from replacing global employee and evaluation data', async () => {
    const kv = new MemoryKv();
    const env = { CHALAK_DB: kv } as CloudflareEnv;
    const employee: AuthSession = {
      id: 'emp-1', name: 'One', username: 'one', role: 'employee', expiresAt: Date.now() + 60_000,
    };
    await kv.put('app_state', JSON.stringify({
      pe_employees: [
        { id: 'emp-1', username: 'one', code: 'E1', role: 'employee' },
        { id: 'emp-2', username: 'two', code: 'E2', role: 'admin' },
      ],
      pe_evaluations: [
        { id: 'ev-1', empId: 'emp-1', status: 'draft' },
        { id: 'ev-2', empId: 'emp-2', status: 'locked' },
      ],
    }));

    await onRequestPost(context(env, employee, {
      baseRevision: 0,
      state: {
        pe_employees: [{ id: 'emp-2', role: 'employee' }],
        pe_evaluations: [{ id: 'ev-1', empId: 'emp-1', status: 'pending' }],
      },
    }));

    const saved = JSON.parse((await kv.get('app_state'))!);
    expect(saved.pe_employees[1].role).toBe('admin');
    expect(saved.pe_evaluations.find((item: any) => item.id === 'ev-1').status).toBe('pending');
    expect(saved.pe_evaluations.find((item: any) => item.id === 'ev-2').status).toBe('locked');
  });

  it('rejects a stale write without replacing newer cloud data', async () => {
    const kv = new MemoryKv();
    const env = { CHALAK_DB: kv } as CloudflareEnv;

    expect((await onRequestPost(context(env, admin, {
      baseRevision: 0,
      state: { pe_criteria: [{ id: 'newer' }] },
    }))).status).toBe(200);

    const stale = await onRequestPost(context(env, admin, {
      baseRevision: 0,
      state: { pe_criteria: [{ id: 'stale' }] },
    }));
    expect(stale.status).toBe(409);
    expect(JSON.parse((await kv.get('app_state'))!).pe_criteria).toEqual([{ id: 'newer' }]);
  });
});

describe('password administration API', () => {
  it('sets and resets a user password without retaining plaintext', async () => {
    const kv = new MemoryKv();
    const env = { CHALAK_DB: kv } as CloudflareEnv;
    await kv.put('app_state', JSON.stringify({ pe_employees: [{ id: 'emp-1', username: 'one', code: 'E1' }] }));
    const postContext = {
      request: new Request('https://example.test/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'one', password: 'Secure#123' }),
      }), env, data: { session: admin },
    };
    expect((await postPassword(postContext)).status).toBe(200);
    expect(await kv.get('credential:one')).not.toContain('Secure#123');
    expect(await kv.get('credential_version:one')).toBe('1');

    const deleteContext = {
      request: new Request('https://example.test/api/auth/password', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'one' }),
      }), env, data: { session: admin },
    };
    expect((await deletePassword(deleteContext)).status).toBe(200);
    expect(await kv.get('credential:one')).toBeNull();
    expect(await kv.get('credential_version:one')).toBe('2');
  });
});
