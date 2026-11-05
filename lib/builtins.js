// Trigger words of the built-in providers. Command entries may not reuse them. Shared by the
// extension and the preferences window (which has no provider list); a test checks it against
// the providers the extension actually registers.
export const BUILTIN_TRIGGERS = Object.freeze(['calc', 'emo', 'win', 'session', 'wall', 'clip', 'set', 'rec']);
