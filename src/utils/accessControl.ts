import { Employee } from '../types';

const COMMON_TABS = new Set(['workflow', 'lattice-hub', 'onboarding', 'support']);
const ADMIN_TABS = new Set(['dashboard', 'evaluations', 'kickidler-hub', 'criteria', 'profiles', 'employees', 'calibration', 'reports', 'rewards', 'settings']);
const SUPERVISOR_TABS = new Set(['dashboard', 'evaluations', 'kickidler-hub']);
const EMPLOYEE_TABS = new Set(['my-evaluation']);
const PERMISSION_TABS: Record<string, string> = {
  criteria: 'manage_criteria',
  reports: 'view_all_reports',
};

export function defaultTabFor(user: Employee): string {
  return user.role === 'employee' ? 'my-evaluation' : 'dashboard';
}

export function canAccessTab(user: Employee, tab: string): boolean {
  if (COMMON_TABS.has(tab)) return true;
  if (user.role === 'admin') return ADMIN_TABS.has(tab);
  const permission = PERMISSION_TABS[tab];
  if (permission && user.permissions?.includes(permission)) return true;
  if (user.role === 'supervisor') return SUPERVISOR_TABS.has(tab);
  return EMPLOYEE_TABS.has(tab);
}
