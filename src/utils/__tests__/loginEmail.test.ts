import { describe, it, expect } from 'vitest';
import { loginEmailFor, isValidUsername, isInternalLoginEmail } from '../loginEmail';

describe('username logins', () => {
  it('builds the same hidden login address for company code + username', () => {
    expect(loginEmailFor('Alpha', ' John.Tan ')).toBe('alpha.john.tan@users.quantivra.app');
    expect(isInternalLoginEmail(loginEmailFor('alpha', 'x1y'))).toBe(true);
    expect(isInternalLoginEmail('john@gmail.com')).toBe(false);
  });
  it('accepts sensible usernames only', () => {
    for (const ok of ['john', 'john.tan', 'j_tan-2', 'ABC']) expect(isValidUsername(ok), ok).toBe(true);
    for (const bad of ['jo', 'john tan', '.john', 'john.', 'john@x', 'a'.repeat(33)]) expect(isValidUsername(bad), bad).toBe(false);
  });
});
