import { describe, expect, it } from 'vitest';
import type { SecondOpinion } from './domain';
import { secondOpinionLine } from './report';
import { credentialFromVpToken, secondOpinionComparable, secondOpinionFinding } from './secondOpinion';

const opinion = (over: Partial<SecondOpinion> = {}): SecondOpinion => ({
  verifierId: 'mock-verifier',
  displayName: 'Mock verifier',
  outcome: 'VALID',
  comparable: true,
  agrees: true,
  ...over,
});

describe('second opinion (VER-002)', () => {
  it('takes the credential out of a vp_token', () => {
    expect(credentialFromVpToken('h.p.s~d1~d2~kb.p.s')).toBe('h.p.s~d1~d2~');
    expect(credentialFromVpToken('h.p.s~d1~')).toBe('h.p.s~d1~');
    // Inji Wallet's JSON-encoded string.
    expect(credentialFromVpToken('"h.p.s~d1~kb.p.s"')).toBe('h.p.s~d1~');
    expect(credentialFromVpToken(JSON.stringify({ verifiableCredential: [{ id: 'vc-1' }] }))).toBe('{"id":"vc-1"}');
    expect(credentialFromVpToken('h.p.s')).toBeUndefined();
    expect(credentialFromVpToken('{not json')).toBeUndefined();
  });

  it('compares only verdicts that rest on the credential', () => {
    expect(secondOpinionComparable({ outcome: 'INVALID' })).toBe(true);
    expect(secondOpinionComparable({ outcome: 'EXPIRED' }, 'T-EXPIRED')).toBe(true);
    expect(secondOpinionComparable({ outcome: 'INVALID' }, 'T-NONCE-REPLAY')).toBe(false);
    expect(secondOpinionComparable({ outcome: 'REJECTED' })).toBe(false);
    expect(
      secondOpinionComparable({
        outcome: 'INVALID',
        stages: [{ id: 'holder-binding', label: 'Holder binding', status: 'fail', message: 'nonce' }],
      }),
    ).toBe(false);
  });

  it('is INFO when the verifiers agree or cannot be compared, WARN when they disagree', () => {
    const primary = { name: 'Inji Verify', outcome: 'VALID' as const };
    expect(secondOpinionFinding(opinion(), primary)).toEqual({
      severity: 'INFO',
      message: 'Second opinion agrees: Inji Verify and Mock verifier both say Valid',
    });
    expect(secondOpinionFinding(opinion({ outcome: 'INVALID', agrees: false, reason: 'Issuer signature: bad' }), primary)).toMatchObject({
      severity: 'WARN',
      message: expect.stringContaining('Mock verifier says Invalid (Issuer signature: bad)'),
    });
    expect(secondOpinionFinding(opinion({ comparable: false, agrees: false }), primary).severity).toBe('INFO');
  });

  it('renders the report line', () => {
    expect(secondOpinionLine(opinion())).toBe('Mock verifier: Valid — agrees');
    expect(secondOpinionLine(opinion({ outcome: 'INVALID', agrees: false }))).toBe('Mock verifier: Invalid — **disagrees**');
    expect(secondOpinionLine(opinion({ comparable: false }))).toContain('not compared');
  });
});
