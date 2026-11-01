import { describe, expect, it } from 'vitest';
import { renderReportMarkdown, RunReportSchema, verdictSummary, type RunReport } from './report';

const report: RunReport = {
  runId: 'run-1',
  createdAt: '2026-10-18T10:00:00Z',
  finishedAt: '2026-10-18T10:00:42Z',
  durationMs: 42_000,
  mode: 'full',
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
    expect(md).toContain('| Outcome | Fail — Expected Valid; Inji Verify never gave a verification result (stopped at Token exchange). |');
    expect(md).toContain('| Prediction | Not recorded for this run |');
    expect(md).toContain('| Error detail | Token exchange: Token request rejected: invalid_grant (HTTP 400) |');
    expect(md).toContain('| issuing | Token exchange | failed | tap | 512 ms |');
    expect(md).toContain('{"error":"invalid_grant"}');
  });

  it('reads reports saved before run modes as full runs', () => {
    const { mode: _mode, ...legacy } = report;
    expect(RunReportSchema.parse(legacy).mode).toBe('full');
  });

  it('does not judge an issue-only run against a verifier result', () => {
    const md = renderReportMarkdown({
      ...report,
      mode: 'issue-only',
      verdict: 'PASS',
      passed: true,
      error: undefined,
      steps: [{ phase: 'holding', step: 'credential_held', status: 'done', evidenceKind: 'adapter' }],
    });
    expect(md).toContain('| Run mode | Issue only |');
    expect(md).toContain('| Verifier | Inji Verify (0.18.1) — not used (issue-only run) |');
    expect(md).toContain(
      '| Outcome | Pass — Issue-only run: the credential was issued and stored in the wallet; nothing was presented. |',
    );
  });

  it('escapes pipes inside table cells', () => {
    const md = renderReportMarkdown({ ...report, error: { step: 'x', message: 'a | b' } });
    expect(md).toContain('a \\| b');
  });

  it('explains a known-unsupported run instead of calling it a plain failure', () => {
    const r: RunReport = {
      ...report,
      verdict: 'NOT_APPLICABLE',
      error: undefined,
      prediction: {
        status: 'unsupported',
        reasons: [
          { role: 'wallet', severity: 'error', message: 'No wallet in the catalog advertises the Digital Credentials API.' },
          { role: 'wallet', severity: 'info', message: 'The selected wallet is not contacted' },
        ],
      },
    };
    expect(RunReportSchema.parse(r)).toEqual(r);
    const md = renderReportMarkdown(r);
    expect(md).toContain('# Interop run report — KNOWN UNSUPPORTED');
    expect(md).toContain('Not counted as an interoperability failure');
    expect(md).toContain('(No wallet in the catalog advertises the Digital Credentials API)');
    expect(md).toContain('| Prediction | Predicted not to work: No wallet in the catalog advertises the Digital Credentials API |');
  });

  it('flags a pass the catalog predicted would fail', () => {
    const { headline, detail } = verdictSummary({
      ...report,
      verdict: 'PASS',
      passed: true,
      error: undefined,
      observedOutcome: 'VALID',
      prediction: { status: 'unsupported', reasons: [{ severity: 'error', message: 'Formats do not match' }] },
    });
    expect(headline).toBe('Pass');
    expect(detail).toBe(
      'Expected Valid; Inji Verify answered Valid. The catalog predicted this combination would not work (Formats do not match); it did, so the prediction is out of date.',
    );
  });
});
