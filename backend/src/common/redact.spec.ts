import { REDACTED, maskEmail, redactDeep, redactHeaders, secretFingerprint } from './redact';

/**
 * The whole point of these helpers is that a secret cannot escape through them,
 * so the tests are mostly "the value is absent from the output".
 */
describe('redaction helpers', () => {
  const SECRET = 'xkeysib-0123456789abcdef0123456789abcdef';

  describe('secretFingerprint', () => {
    it('never contains the value', () => {
      const printed = secretFingerprint(SECRET);
      expect(printed).not.toContain(SECRET);
      expect(printed).not.toContain('xkeysib');
    });

    it('is stable for one value and different for another', () => {
      expect(secretFingerprint(SECRET)).toBe(secretFingerprint(SECRET));
      expect(secretFingerprint(SECRET)).not.toBe(secretFingerprint(`${SECRET}x`));
    });

    it('reports the length, which is how a truncated paste is spotted', () => {
      expect(secretFingerprint('abcd')).toContain('len=4');
    });

    it('says so when nothing is configured', () => {
      expect(secretFingerprint(undefined)).toBe('unset');
      expect(secretFingerprint('')).toBe('unset');
    });
  });

  describe('maskEmail', () => {
    it('keeps the domain and hides most of the local part', () => {
      expect(maskEmail('someone@example.com')).toBe('som***@example.com');
    });

    it('does not leak a short local part', () => {
      expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    });

    it('handles a value that is not an address', () => {
      expect(maskEmail('not-an-address')).toBe('no***');
      expect(maskEmail(null)).toBeNull();
    });
  });

  describe('redactHeaders', () => {
    it('replaces an authorization header but keeps the key visible', () => {
      const safe = redactHeaders({ authorization: 'Bearer abc.def.ghi', accept: 'application/json' });
      expect(safe.authorization).toBe(REDACTED);
      expect(safe.accept).toBe('application/json');
      expect(JSON.stringify(safe)).not.toContain('abc.def.ghi');
    });

    it('is case-insensitive about header names', () => {
      expect(redactHeaders({ Authorization: 'Bearer x' }).Authorization).toBe(REDACTED);
      expect(redactHeaders({ 'Set-Cookie': 'session=1' })['Set-Cookie']).toBe(REDACTED);
    });
  });

  describe('redactDeep', () => {
    it('removes secrets at any depth', () => {
      const config = {
        mail: { host: 'smtp.example.com', port: 2525, password: SECRET },
        google: { clientId: 'public-id', client_secret: 'GOCSPX-abc' },
        nested: { list: [{ token: 'abc.def' }] },
      };
      const safe = redactDeep(config);
      const printed = JSON.stringify(safe);
      expect(printed).not.toContain(SECRET);
      expect(printed).not.toContain('GOCSPX-abc');
      expect(printed).not.toContain('abc.def');
      // Non-secret context survives, which is what makes the dump useful.
      expect(printed).toContain('smtp.example.com');
      expect(printed).toContain('2525');
      expect(printed).toContain('public-id');
    });

    it('keeps null and undefined distinguishable from a redacted value', () => {
      const safe = redactDeep({ password: null, token: undefined }) as Record<string, unknown>;
      expect(safe.password).toBeNull();
      expect(safe.token).toBeUndefined();
    });

    it('does not recurse forever on a cycle', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };
      cyclic.self = cyclic;
      expect(() => redactDeep(cyclic)).not.toThrow();
    });
  });
});
