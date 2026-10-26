import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandMatrix, loadMatrix } from './matrix.ts';

describe('expandMatrix', () => {
  it('crosses the axes, drops excludes, then appends includes in order', () => {
    const lanes = expandMatrix(
      loadMatrix(`
name: t
axes:
  issuer: [i]
  wallet: [w]
  verifier: [v1, v2]
  format: [vc+sd-jwt, ldp_vc]
exclude:
  - { verifier: v2, format: ldp_vc }
include:
  - { issuer: i, wallet: w, verifier: v1, format: ldp_vc, tamper: { id: T-SIG-FLIP }, expectedOutcome: INVALID }
`),
    );
    expect(lanes.map((l) => l.key)).toEqual([
      'i → w → v1 · vc+sd-jwt',
      'i → w → v1 · ldp_vc',
      'i → w → v2 · vc+sd-jwt',
      'i → w → v1 · ldp_vc · T-SIG-FLIP · expect INVALID',
    ]);
    expect(lanes[3]!.config).toMatchObject({
      mode: 'full',
      grantType: 'pre-authorized_code',
      presentationFlow: 'cross-device-qr',
      tamper: { id: 'T-SIG-FLIP' },
      expectedOutcome: 'INVALID',
    });
  });

  it('runs a lane listed twice once and keeps its known gap', () => {
    const lanes = expandMatrix(
      loadMatrix(`
name: t
defaults: { expectedOutcome: VALID }
include:
  - { issuer: i, wallet: w, verifier: v, format: vc+sd-jwt, knownGap: "gap 1" }
  - { issuer: i, wallet: w, verifier: v, format: vc+sd-jwt }
`),
    );
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.knownGap).toBe('gap 1');
    expect(lanes[0]!.config).not.toHaveProperty('knownGap');
  });

  it('rejects a lane without a wallet and an unknown format', () => {
    expect(() => expandMatrix(loadMatrix('name: t\ninclude: [{ issuer: i, verifier: v, format: ldp_vc }]'))).toThrow(
      'include[0]: issuer, wallet, verifier and format are required',
    );
    expect(() => loadMatrix('name: t\ninclude: [{ format: jwt_vc }]')).toThrow(/include\.0\.format/);
  });

  it('parses the matrices in the repository', () => {
    for (const name of ['nightly', 'demo']) {
      const text = readFileSync(new URL(`../../../matrices/${name}.yaml`, import.meta.url), 'utf8');
      expect(expandMatrix(loadMatrix(text)).length).toBeGreaterThan(0);
    }
  });
});
