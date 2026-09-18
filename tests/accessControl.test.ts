import { describe, expect, it } from 'vitest';
import { canAccessTab, defaultTabFor } from '../src/utils/accessControl';

const user = (role: 'admin' | 'supervisor' | 'employee', permissions?: string[]) => ({
  id: role, name: role, username: role, code: role, profileId: '', unit: '', role, permissions,
} as any);

describe('role-aware navigation', () => {
  it('allows administrators to open administrative modules', () => {
    expect(canAccessTab(user('admin'), 'settings')).toBe(true);
    expect(canAccessTab(user('admin'), 'rewards')).toBe(true);
  });

  it('blocks employees from administrative modules', () => {
    expect(canAccessTab(user('employee'), 'settings')).toBe(false);
    expect(canAccessTab(user('employee'), 'dashboard')).toBe(false);
    expect(defaultTabFor(user('employee'))).toBe('my-evaluation');
  });

  it('honors explicit permissions without expanding unrelated access', () => {
    const supervisor = user('supervisor', ['manage_criteria']);
    expect(canAccessTab(supervisor, 'criteria')).toBe(true);
    expect(canAccessTab(supervisor, 'settings')).toBe(false);
  });
});
