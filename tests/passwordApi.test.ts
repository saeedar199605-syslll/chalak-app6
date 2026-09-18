import { describe, expect, it, vi, beforeEach } from 'vitest';
import { callPasswordApi } from '../src/utils/passwordApi';

describe('password API response contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockFetch = (response: any, ok: boolean = true, shouldThrowOnJson = false) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      json: shouldThrowOnJson ? vi.fn().mockRejectedValue(new Error('Invalid JSON')) : vi.fn().mockResolvedValue(response),
    });
  };

  const mockFetchNetworkError = () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
  };

  const mockFetchEmptyBody = (ok: boolean = true) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      json: vi.fn().mockResolvedValue(''),
    });
  };

  // Acceptance cases
  it('accepts valid response with success: true', async () => {
    mockFetch({ success: true, data: 'ok' });
    await expect(callPasswordApi('/api/test', {})).resolves.toEqual({ success: true, data: 'ok' });
  });

  it('accepts valid response with success: true and extra fields', async () => {
    mockFetch({ success: true, message: 'Password updated', token: 'abc' });
    await expect(callPasswordApi('/api/test', {})).resolves.toEqual({ success: true, message: 'Password updated', token: 'abc' });
  });

  it.each([
    { success: true, reauthenticationRequired: true },
    { success: true, resetCount: 3 },
    { success: true, username: 'fixture-user' },
  ])('preserves password mutation metadata', async payload => {
    mockFetch(payload);
    await expect(callPasswordApi('/api/auth/password', {})).resolves.toEqual(payload);
  });

  it.each(['<html>failure</html>', 'password=fixture-value', 'Bearer fixture-value', 'stack\ntrace', '   '])(
    'does not expose unsafe application errors', async error => {
      mockFetch({ success: false, error });
      await expect(callPasswordApi('/api/auth/password', {})).rejects.toThrow('Operation failed');
    },
  );

  // Transport failure
  it('rejects on network transport failure with generic message', async () => {
    mockFetchNetworkError();
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Network error');
  });

  // HTTP failure status
  it('rejects on HTTP 4xx error with safe server message', async () => {
    mockFetch({ success: false, error: 'Bad request' }, false);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Bad request');
  });

  it('rejects on HTTP 5xx error with safe server message', async () => {
    mockFetch({ success: false, error: 'Server error' }, false);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Server error');
  });

  it('rejects on HTTP error with unsafe response body', async () => {
    mockFetch({ success: false, error: '<script>alert(1)</script>' }, false);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('HTTP error');
  });

  it('rejects on HTTP error with missing error field', async () => {
    mockFetch({ success: false }, false);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('HTTP error');
  });

  it('rejects on HTTP error with non-string error field', async () => {
    mockFetch({ success: false, error: 123 }, false);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('HTTP error');
  });

  // JSON parse failure
  it('rejects on JSON parse failure with generic message', async () => {
    mockFetch(null, true, true);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  // Empty body (actual empty response, not parse failure)
  it('rejects on empty response body', async () => {
    mockFetchEmptyBody(true);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  // Invalid body types
  it('rejects null response body', async () => {
    mockFetch(null);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  it('rejects array response body', async () => {
    mockFetch([{ success: true }]);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  it('rejects string response body', async () => {
    mockFetch('success');
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  it('rejects number response body', async () => {
    mockFetch(123);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  it('rejects boolean response body', async () => {
    mockFetch(true);
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Invalid response');
  });

  // Missing or invalid success field
  it('rejects response missing success field', async () => {
    mockFetch({ data: 'something' });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: false', async () => {
    mockFetch({ success: false });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: false and uses safe server error message', async () => {
    mockFetch({ success: false, error: 'Password too weak' });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Password too weak');
  });

  it('rejects response with success: false and ignores unsafe error message', async () => {
    mockFetch({ success: false, error: 'a'.repeat(250) });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: "true" (string)', async () => {
    mockFetch({ success: 'true' });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: 1 (number)', async () => {
    mockFetch({ success: 1 });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: null', async () => {
    mockFetch({ success: null });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: undefined', async () => {
    mockFetch({ success: undefined });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: [] (array)', async () => {
    mockFetch({ success: [] });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });

  it('rejects response with success: {} (object)', async () => {
    mockFetch({ success: {} });
    await expect(callPasswordApi('/api/test', {})).rejects.toThrow('Operation failed');
  });
});
