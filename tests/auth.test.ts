import { describe, expect, it } from 'vitest';
import { getCookie, hashPassword, sessionCookie, verifyPassword } from '../cloudflare/auth';

describe('Cloudflare authentication helpers', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const encoded = await hashPassword('A-strong-test-password');
    expect(encoded).not.toContain('A-strong-test-password');
    await expect(verifyPassword('A-strong-test-password', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
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
