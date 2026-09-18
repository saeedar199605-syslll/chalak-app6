import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as passwordApi from '../src/utils/passwordApi';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { validateAdminPasswordChange } from '../src/utils/validation';

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('frontend password persistence boundary', () => {
  it('removes the legacy entry without reading it, even if one storage is blocked', () => {
    const local = { removeItem: vi.fn(() => { throw new Error('blocked'); }), getItem: vi.fn() };
    const session = { removeItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
    const cleanup = (passwordApi as any).clearLegacyPasswordPersistence;
    expect(typeof cleanup).toBe('function');
    cleanup();
    cleanup();
    expect(local.removeItem).toHaveBeenCalledWith('pe_admin_password');
    expect(session.removeItem).toHaveBeenCalledTimes(2);
    expect(local.getItem).not.toHaveBeenCalled();
    expect(session.getItem).not.toHaveBeenCalled();
  });

  it('never reads or writes the forbidden credential key in application code', () => {
    for (const file of ['components/Login.tsx', 'components/ManagementCenter.tsx', 'utils/passwordApi.ts']) {
      expect(/(?:getItem|setItem)\(\s*['"]pe_admin_password['"]/.test(source(file))).toBe(false);
    }
  });
});

// Execute the actual component handlers with deterministic hook state. No DOM package
// is installed; browser rendering and API integration are checked separately in Pages.
function mount(name: 'Login' | 'ManagementCenter') {
  const text = source(`components/${name}.tsx`);
  const ast = ts.createSourceFile(`${name}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name) as ts.FunctionDeclaration;
  const body = component.body!;
  const returned = body.statements.find(ts.isReturnStatement)!;
  const names: string[] = [];
  for (const statement of body.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      if (ts.isArrayBindingPattern(declaration.name)) for (const binding of declaration.name.elements) {
        if (ts.isBindingElement(binding) && ts.isIdentifier(binding.name)) names.push(binding.name.text);
      }
    }
  }
  const instrumented = text.slice(0, returned.getStart(ast)) + `return {${names.join(',')}};\n}`;
  const compiled = ts.transpileModule(instrumented.replaceAll('import.meta.env.DEV', 'true'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const cells: any[] = [];
  let cursor = 0;
  let pendingEffects: (() => void)[] = [];
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], (value: any) => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
    },
    useRef(initial: any) {
      const index = cursor++;
      return cells[index] ??= { current: initial };
    },
    useMemo(fn: () => any) { return fn(); },
    useEffect(fn: () => any, deps: any[]) {
      const index = cursor++;
      if (!cells[index] || deps.some((dep, i) => dep !== cells[index].deps[i])) {
        pendingEffects.push(() => {
          cells[index]?.cleanup?.();
          cells[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const writes: unknown[] = [];
  const storage = () => ({ getItem: vi.fn(() => null), removeItem: vi.fn(), setItem: vi.fn((...args) => writes.push(args)) });
  const localStorage = storage();
  const sessionStorage = storage();
  const logs = { log: vi.fn((...args) => writes.push(args)), error: vi.fn((...args) => writes.push(args)), warn: vi.fn((...args) => writes.push(args)) };
  const indexedDB = { open: vi.fn(() => { throw new Error('Unexpected IndexedDB write'); }) };
  const fixture = (label: string) => ['Test', label, 100 + 23, '!'].join('-');
  const generated = fixture('generated');
  const api = vi.fn().mockResolvedValue({ success: true });
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ customUsernames: [] }) });
  const exports: any = {};
  const employee = { id: 'test-employee', username: 'test.employee', name: 'Test employee', code: 'test-code', role: 'employee', unit: 'Test' };
  const props = { employees: [employee], profiles: [], criteria: [], evaluations: [], archivedEvaluations: [], currentUser: { name: 'Test admin', id: 'test-admin' }, theme: 'light', onLogin: vi.fn(), onForceReauth: vi.fn() };
  const window = { localStorage, sessionStorage, dispatchEvent: vi.fn(), confirm: vi.fn(() => true), location: { reload: vi.fn() } };
  runInNewContext(compiled, {
    exports, localStorage, sessionStorage, window, indexedDB, console: logs, fetch,
    setTimeout: vi.fn(), clearTimeout: vi.fn(), Event: class {}, CustomEvent: class {},
    require(id: string) {
      if (id === 'react') return { ...hooks, default: hooks };
      if (id.endsWith('/passwordApi')) return { ...passwordApi, callPasswordApi: api };
      if (id.endsWith('/validation')) return { validateAdminPasswordChange, clearLegacyAdminSessions: vi.fn() };
      if (id.endsWith('/password')) return { generateSecurePassword: () => generated };
      if (id.endsWith('/db')) return { db: { saveMiscData: (...args: unknown[]) => writes.push(args) } };
      if (id.endsWith('/manualAccessManager')) return { getManualAccessPolicy: () => ({}), canUserViewManual: () => false, canUserDownloadManual: () => false };
      return {};
    },
  });
  const render = () => {
    cursor = 0;
    const result = exports.default(props);
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach(fn => fn());
    return result;
  };
  render();
  return { render, api, fetch, generated, fixture, employee, props, window, indexedDB, writes,
    unmount: () => { cells.forEach(cell => cell?.cleanup?.()); },
    assertNoPersistence() {
      render();
      const serialized = JSON.stringify(writes);
      for (const secret of [generated, fixture('current'), fixture('new'), fixture('custom')]) {
        expect(serialized.includes(secret)).toBe(false);
      }
      expect(indexedDB.open).not.toHaveBeenCalled();
    },
  };
}

const event = { preventDefault() {} };
function enterAdmin(h: ReturnType<typeof mount>) {
  const ui = h.render();
  ui.setCurrentAdminPasswordInput(h.fixture('current'));
  ui.setNewAdminPasswordInput(h.fixture('new'));
  ui.setConfirmAdminPasswordInput(h.fixture('new'));
}
function expectAdminCleared(h: ReturnType<typeof mount>) {
  const ui = h.render();
  expect([ui.currentAdminPasswordInput, ui.newAdminPasswordInput, ui.confirmAdminPasswordInput].every(value => value === '')).toBe(true);
  h.assertNoPersistence();
}

describe('temporary component password state', () => {
  it('clears an earlier generated handoff if generation fails', async () => {
    const h = mount('ManagementCenter');
    await h.render().handleGenerateRandomPassword(h.employee);
    h.api.mockRejectedValueOnce(new Error('Network error'));
    await h.render().handleGenerateRandomPassword(h.employee);
    expect(h.render().customPasswordInput === '').toBe(true);
    expect(h.render().credentialsFeedback.type).toBe('error');
    h.assertNoPersistence();
  });

  it.each(['cancel', 'panel', 'unmount'])('clears existing temporary values on %s', async end => {
    const h = mount('ManagementCenter');
    enterAdmin(h);
    await h.render().handleGenerateRandomPassword(h.employee);
    if (end === 'cancel') { h.window.confirm.mockReturnValue(false); await h.render().handleBulkResetAllPasswords(); }
    if (end === 'panel') { h.render().setActiveSectionTab('logs'); h.render(); }
    if (end === 'unmount') h.unmount();
    expect(h.render().customPasswordInput === '').toBe(true);
    if (end !== 'cancel') expectAdminCleared(h);
    h.assertNoPersistence();
  });

  it.each(['tab', 'unmount'])('clears login values and ignores late login after %s', async end => {
    const h = mount('Login');
    h.render().setActiveTab('admin'); h.render();
    h.render().setAdminUsername('admin');
    h.render().setAdminPassword(h.fixture('current'));
    let resolve!: (value: any) => void;
    h.fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const request = h.render().handleFormSubmit(event);
    if (end === 'tab') { h.render().setActiveTab('users'); h.render(); }
    else h.unmount();
    resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ user: { role: 'admin' } }) });
    await request;
    expect(h.render().adminPassword === '').toBe(true);
    expect(h.props.onLogin).not.toHaveBeenCalled();
    h.assertNoPersistence();
  });

  it.each(['network', 'html'])('never authenticates an administrator locally after %s failure', async failure => {
    const h = mount('Login');
    h.render().setActiveTab('admin'); h.render();
    h.render().setAdminUsername('admin'); h.render().setAdminPassword(h.fixture('current'));
    if (failure === 'network') h.fetch.mockRejectedValue(new Error('Network error'));
    else h.fetch.mockResolvedValue({ ok: true, headers: { get: () => 'text/html' } });
    await h.render().handleFormSubmit(event);
    expect(h.props.onLogin).not.toHaveBeenCalled();
    expect(h.render().adminPassword === '').toBe(true);
    h.assertNoPersistence();
  });

  it.each(['success', 'failure', 'validation'])('clears administrator inputs after %s', async outcome => {
    const h = mount('ManagementCenter');
    enterAdmin(h);
    if (outcome === 'failure') h.api.mockRejectedValue(new Error('Network error'));
    if (outcome === 'validation') h.render().setConfirmAdminPasswordInput('');
    await h.render().handleChangeAdminPassword(event);
    expectAdminCleared(h);
    if (outcome !== 'validation') expect(h.api).toHaveBeenCalledOnce();
  });

  it.each(['success', 'failure', 'validation'])('clears custom input after %s', async outcome => {
    const h = mount('ManagementCenter');
    h.render().handleOpenEditPassword(h.employee);
    h.render().setCustomPasswordInput(outcome === 'validation' ? 'x' : h.fixture('custom'));
    if (outcome === 'failure') h.api.mockRejectedValue(new Error('Network error'));
    await h.render().handleSaveCustomPassword(event);
    expect(h.render().customPasswordInput === '').toBe(true);
    h.assertNoPersistence();
  });

  it('keeps generated output only in its active handoff and clears on close', async () => {
    const h = mount('ManagementCenter');
    await h.render().handleGenerateRandomPassword(h.employee);
    expect(h.render().editingPasswordEmp?.id).toBe(h.employee.id);
    expect(h.render().customPasswordInput === h.generated).toBe(true);
    h.render().handleClosePasswordEditor();
    expect(h.render().customPasswordInput === '').toBe(true);
    h.assertNoPersistence();
  });

  it.each(['close', 'panel', 'unmount', 'reset'])('does not restore a generated password after %s during a request', async end => {
    const h = mount('ManagementCenter');
    let resolve!: (value: any) => void;
    h.api.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const request = h.render().handleGenerateRandomPassword(h.employee);
    if (end === 'close') h.render().handleClosePasswordEditor();
    if (end === 'panel') { h.render().setActiveSectionTab('logs'); h.render(); }
    if (end === 'unmount') h.unmount();
    if (end === 'reset') await h.render().handleResetUserPasswordToDefault(h.employee.username);
    resolve({ success: true });
    await request;
    expect(h.render().customPasswordInput === '').toBe(true);
    h.assertNoPersistence();
  });

  it.each(['success', 'failure'])('clears login input after %s', async outcome => {
    const h = mount('Login');
    h.render().setActiveTab('admin'); h.render();
    h.render().setAdminUsername('admin');
    h.render().setAdminPassword(h.fixture('current'));
    h.fetch.mockResolvedValue({ ok: outcome === 'success', headers: { get: () => 'application/json' }, json: async () => outcome === 'success' ? { user: { role: 'admin' } } : { error: 'Login failed' } });
    await h.render().handleFormSubmit(event);
    expect(h.render().adminPassword === '').toBe(true);
    expect(h.props.onLogin).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0);
    h.assertNoPersistence();
  });
});
