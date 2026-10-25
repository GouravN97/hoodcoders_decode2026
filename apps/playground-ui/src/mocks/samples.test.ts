import { buildMatrix, summarizeRun } from '@playground/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { seedSampleRuns } from './samples';

describe('sample run history', () => {
  beforeEach(() => db.clear());

  it('seeds once, and every sample is labelled as sample data', () => {
    seedSampleRuns();
    seedSampleRuns();
    const runs = db.list();
    expect(runs.length).toBeGreaterThan(5);
    expect(new Set(runs.map((r) => r.id)).size).toBe(runs.length);
    expect(runs.every((r) => r.config.labels?.sample === 'true')).toBe(true);
  });

  it('snapshots the catalog versions from the YAML, not invented ones', () => {
    seedSampleRuns();
    const certify = db.list()[0]!.versions.find((v) => v.role === 'issuer');
    expect(certify).toMatchObject({ implementationId: 'inji-certify', version: '0.14.0', displayName: 'Inji Certify' });
  });

  it('gives the matrix rows for full and issue-only runs', () => {
    seedSampleRuns();
    const m = buildMatrix(db.list().map((r) => summarizeRun(r)));
    expect(m.rows.some((r) => !r.verifier)).toBe(true);
    expect(m.formats).toEqual(expect.arrayContaining(['ldp_vc', 'vc+sd-jwt']));
  });
});
