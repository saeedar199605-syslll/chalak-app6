import { describe, expect, it } from 'vitest';
import { generateSecurePassword } from '../src/utils/password';
import { validateAdminPasswordChange } from '../src/utils/validation';

describe('password policy and generator', () => {
  it('generates distinct cryptographically random policy-compliant values', () => {
    const first = generateSecurePassword();
    const second = generateSecurePassword();
    expect(first).toHaveLength(16);
    expect(second).toHaveLength(16);
    expect(first).not.toBe(second);
    expect(first).toMatch(/[A-Z]/);
    expect(first).toMatch(/[a-z]/);
    expect(first).toMatch(/[0-9]/);
    expect(first).toMatch(/[!@#$%&*?]/);
  });

  it('uses the same eight-character minimum expected by the API', () => {
    expect(validateAdminPasswordChange({ currentPassword: 'old', newPassword: 'Abcd123!', confirmPassword: 'Abcd123!' }).success).toBe(true);
    expect(validateAdminPasswordChange({ currentPassword: 'old', newPassword: 'Ab1!xyz', confirmPassword: 'Ab1!xyz' }).success).toBe(false);
  });
});
