// Company users sign in with company code + username. Supabase Auth needs an
// email for every login, so each username gets a hidden internal address that
// is never shown to anyone or sent mail. Used by the login page and by the
// server when it creates logins — both must build it the same way.

/** 3–32 characters: lowercase letters, digits, and . _ - (not at the ends). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
export const USERNAME_RULE_TEXT = '3–32 characters: lowercase letters, numbers, dots, dashes or underscores';

export function normaliseUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function isValidUsername(u: string): boolean {
  return USERNAME_PATTERN.test(normaliseUsername(u));
}

export function loginEmailFor(companyCode: string, username: string): string {
  const code = companyCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${code}.${normaliseUsername(username)}@users.quantivra.app`;
}

export function isInternalLoginEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@users.quantivra.app');
}
