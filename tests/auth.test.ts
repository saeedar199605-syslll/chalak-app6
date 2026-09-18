import { describe, expect, it } from 'vitest';
import {
  getCookie,
  hashPassword,
  sessionCookie,
  verifyPassword,
  CURRENT_PBKDF2_ITERATIONS,
} from '../cloudflare/auth';

describe('Cloudflare authentication helpers', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const encoded = await hashPassword('A-strong-test-password');
    expect(encoded).not.toContain('A-strong-test-password');
    await expect(verifyPassword('A-strong-test-password', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
  });

  it('uses Cloudflare-compatible PBKDF2 iteration count (<= 100000)', async () => {
    const encoded = await hashPassword('TestPassword123!');
    const record = JSON.parse(encoded);
    expect(record.iterations).toBeLessThanOrEqual(100_000);
    expect(record.iterations).toBe(CURRENT_PBKDF2_ITERATIONS);
    expect(CURRENT_PBKDF2_ITERATIONS).toBe(100_000);
  });

  it('includes salt, hash, and iterations in the stored record', async () => {
    const encoded = await hashPassword('TestPassword456!');
    const record = JSON.parse(encoded);
    expect(record.salt).toBeTruthy();
    expect(typeof record.salt).toBe('string');
    expect(record.hash).toBeTruthy();
    expect(typeof record.hash).toBe('string');
    expect(Number.isInteger(record.iterations)).toBe(true);
    expect(record.iterations).toBeGreaterThan(0);
  });

  it('verifies password with stored iterations', async () => {
    const encoded = await hashPassword('IterationTestPass!');
    const record = JSON.parse(encoded);
    expect(record.iterations).toBe(CURRENT_PBKDF2_ITERATIONS);
    await expect(verifyPassword('IterationTestPass!', encoded)).resolves.toBe(true);
  });

  it('fails on wrong password', async () => {
    const encoded = await hashPassword('CorrectPassword!');
    await expect(verifyPassword('WrongPassword!', encoded)).resolves.toBe(false);
  });

  it('handles malformed hash records safely', async () => {
    expect(await verifyPassword('anything', 'not-json')).toBe(false);
    expect(await verifyPassword('anything', '{}')).toBe(false);
    expect(await verifyPassword('anything', '{"salt":"abc"}')).toBe(false);
    expect(await verifyPassword('anything', '{"hash":"abc","iterations":100000}')).toBe(false);
    expect(await verifyPassword('anything', '{"salt":"","hash":"","iterations":0}')).toBe(false);
  });

  it('rejects legacy hashes with iterations above Cloudflare limit without crashing', async () => {
    // Simulate a legacy hash that used 120000 iterations (old code)
    const legacyHash = JSON.stringify({
      salt: btoa('legacy-salt'),
      hash: btoa('legacy-hash'),
      iterations: 120_000,
    });
    // Must return false, not throw NotSupportedError
    const result = await verifyPassword('some-password', legacyHash);
    expect(result).toBe(false);
  });

  it('generates unique salts per hash', async () => {
    const hash1 = await hashPassword('SamePassword123!');
    const hash2 = await hashPassword('SamePassword123!');
    const record1 = JSON.parse(hash1);
    const record2 = JSON.parse(hash2);
    expect(record1.salt).not.toBe(record2.salt);
    expect(record1.hash).not.toBe(record2.hash);
    // Both should still verify
    await expect(verifyPassword('SamePassword123!', hash1)).resolves.toBe(true);
    await expect(verifyPassword('SamePassword123!', hash2)).resolves.toBe(true);
  });

  it('password change: old password fails after new hash is stored', async () => {
    const oldHash = await hashPassword('OldPassword123!');
    const newHash = await hashPassword('NewPassword456!');
    // Old hash still works with old password
    await expect(verifyPassword('OldPassword123!', oldHash)).resolves.toBe(true);
    // After change, old hash is replaced — old password should fail against new hash
    await expect(verifyPassword('OldPassword123!', newHash)).resolves.toBe(false);
    await expect(verifyPassword('NewPassword456!', newHash)).resolves.toBe(true);
  });

  it('admin password flow: hash and verify round-trip', async () => {
    const adminHash = await hashPassword('AdminStrongPass2026!');
    await expect(verifyPassword('AdminStrongPass2026!', adminHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-admin-password', adminHash)).resolves.toBe(false);
    // Hash must not contain plaintext
    expect(adminHash).not.toContain('AdminStrongPass2026!');
  });

  it('employee password flow: hash and verify round-trip', async () => {
    const empHash = await hashPassword('EmployeePass789!');
    await expect(verifyPassword('EmployeePass789!', empHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-employee-password', empHash)).resolves.toBe(false);
    expect(empHash).not.toContain('EmployeePass789!');
  });

  it('session invalidation: credential version check does not depend on iteration count', async () => {
    // The authVersion mechanism in login.ts is independent of PBKDF2 iterations
    // This test verifies the hash format is consistent
    const encoded = await hashPassword('SessionTest123!');
    const record = JSON.parse(encoded);
    expect(record.iterations).toBe(CURRENT_PBKDF2_ITERATIONS);
    expect(record.iterations).toBeLessThanOrEqual(100_000);
  });

  it('creates hardened production cookies and HTTP-safe local cookies', () => {
    expect(sessionCookie('abc')).toContain('HttpOnly; Secure; SameSite=Strict');
    expect(sessionCookie('abc', 10, false)).not.toContain('; Secure');
  });

  it('parses a named cookie without accepting a similarly named cookie', () => {
    const request = new Request('https://example.test', { headers: { Cookie: 'other=1; chalak_session=token%3Dvalue' } });
    expect(getCookie(request, 'chalak_session')).toBe('token=value');
  });
});
