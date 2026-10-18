import { describe, expect, it } from 'vitest';
import { renderReportMarkdown, RunReportSchema, type RunReport } from './report';

const report: RunReport = {
  runId: 'run-1',
  createdAt: '2026-10-18T10:00:00Z',
  finishedAt: '2026-10-18T10:00:42Z',
  durationMs: 42_000,
  issuer: { role: 'issuer', id: 'inji-certify', displayName: 'Inji Certify', version: '0.12.1' },
  wallet: { role: 'wallet', id: 'inji-wallet-mobile', displayName: 'Inji Wallet (mobile)' },
  verifier: { role: 'verifier', id: 'inji-verify', displayName: 'Inji Verify', version: '0.18.1' },
  format: 'vc+sd-jwt',
  credentialConfigurationId: 'FarmerCredentialSdJwt',
  proofType: 'ES256',
  grantType: 'pre-authorized_code',
  presentationFlow: 'cross-device-qr',
  expectedOutcome: 'VALID',
  verdict: 'FAIL',
  passed: false,
  error: { step: 'oid4vci.token', message: 'Token request rejected: invalid_grant', status: 400, body: '{"error":"invalid_grant"}' },
  steps: [{ phase: 'issuing', step: 'oid4vci.token', status: 'failed', evidenceKind: 'tap', durationMs: 512 }],
  correlation: 'exact',
  findings: [],
  inspectorUrl: 'http://localhost/runs/run-1#inspector',
};

describe('renderReportMarkdown', () => {
  it('contains all seven required report fields', () => {
    expect(RunReportSchema.parse(report)).toEqual(report);
    const md = renderReportMarkdown(report);
    expect(md).toContain('# Interop run report — FAIL');
    expect(md).toContain('| Issuer | Inji Certify (0.12.1) |');
    expect(md).toContain('| Wallet | Inji Wallet (mobile) |');
    expect(md).toContain('| Verifier | Inji Verify (0.18.1) |');
    expect(md).toContain('| Format | SD-JWT VC (`vc+sd-jwt`) |');
    expect(md).toContain('| Proof type | ES256 |');
    expect(md).toContain('| Outcome | Fail — observed no result, expected Valid |');
    expect(md).toContain('| Error detail | Token exchange: Token request rejected: invalid_grant (HTTP 400) |');
    expect(md).toContain('| issuing | Token exchange | failed | tap | 512 ms |');
    expect(md).toContain('{"error":"invalid_grant"}');
  });

  it('escapes pipes inside table cells', () => {
    const md = renderReportMarkdown({ ...report, error: { step: 'x', message: 'a | b' } });
    expect(md).toContain('a \\| b');
  });
});
