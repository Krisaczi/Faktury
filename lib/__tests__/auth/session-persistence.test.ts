import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthCookieOptions, isRememberMe, REMEMBER_ME_COOKIE, SESSION_TIMEOUT_MS } from '../../../lib/auth/cookie-options';

describe('getAuthCookieOptions', () => {
  it('returns no maxAge when rememberMe is false (session-only cookie)', () => {
    const opts = getAuthCookieOptions(false);
    assert.equal(opts.maxAge, undefined);
  });

  it('returns 7-day maxAge when rememberMe is true', () => {
    const opts = getAuthCookieOptions(true);
    assert.equal(opts.maxAge, 60 * 60 * 24 * 7);
  });

  it('always sets httpOnly, sameSite, path, and secure', () => {
    const opts = getAuthCookieOptions(false);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, 'lax');
    assert.equal(opts.path, '/');
    // secure depends on NODE_ENV but should be a boolean
    assert.equal(typeof opts.secure, 'boolean');
  });
});

describe('isRememberMe', () => {
  it('returns true when remember-me cookie is "1" in array format', () => {
    const cookies = [
      { name: 'other', value: 'x' },
      { name: REMEMBER_ME_COOKIE, value: '1' },
    ];
    assert.equal(isRememberMe(cookies), true);
  });

  it('returns false when remember-me cookie is "0"', () => {
    const cookies = [
      { name: REMEMBER_ME_COOKIE, value: '0' },
    ];
    assert.equal(isRememberMe(cookies), false);
  });

  it('returns false when remember-me cookie is absent', () => {
    const cookies = [
      { name: 'other', value: 'x' },
    ];
    assert.equal(isRememberMe(cookies), false);
  });

  it('works with a cookie store object (get method)', () => {
    const store = {
      get: (name: string) => (name === REMEMBER_ME_COOKIE ? '1' : undefined),
    };
    assert.equal(isRememberMe(store), true);
  });

  it('returns false for empty cookie list', () => {
    assert.equal(isRememberMe([]), false);
  });
});

describe('SESSION_TIMEOUT_MS', () => {
  it('is 60 minutes in milliseconds', () => {
    assert.equal(SESSION_TIMEOUT_MS, 60 * 60 * 1000);
  });
});
