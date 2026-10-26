import type { Exchange, RunReport } from '@playground/shared';
import { describe, expect, it } from 'vitest';
import { clusterFailures, normalizeError, readableBody, renderGapIndex, renderIssueDraft, signatureOf, slug } from './gaps.ts';

const p = (role: 'issuer' | 'wallet' | 'verifier', id: string, displayName: string, version: string) => ({
  role,
  id,
  displayName,
  version,
});

function report(over: Partial<RunReport> & { runId: string }): RunReport {
  return {
    createdAt: '2026-10-26T05:00:00Z',
    mode: 'full',
    issuer: p('issuer', 'inji-certify', 'Inji Certify', '0.14.0'),
    wallet: p('wallet', 'mock-wallet', 'Mock wallet', '0.1.0'),
    verifier: p('verifier', 'inji-verify', 'Inji Verify', '0.18.2'),
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'FarmerCredentialSdJwt',
    grantType: 'pre-authorized_code',
    presentationFlow: 'cross-device-qr',
    expectedOutcome: 'VALID',
    verdict: 'FAIL',
    passed: false,
    steps: [],
    correlation: 'exact',
    findings: [],
    inspectorUrl: 'http://ui/runs/x',
    ...over,
  };
}

const wrongType = (runId: string, format: RunReport['format'], createdAt: string) =>
  report({
    runId,
    format,
    createdAt,
    tamper: { id: 'T-WRONG-TYPE', label: 'Wrong credential type', mechanism: 'wallet-hook', expectedOutcome: 'INVALID', detected: false },
    expectedOutcome: 'INVALID',
    observedOutcome: 'VALID',
    error: { step: 'verify.result', message: 'Expected INVALID, verifier returned VALID' },
  });

describe('signatureOf / clusterFailures', () => {
  it('groups an accepted tamper across formats under one Inji Verify gap', () => {
    const clusters = clusterFailures([
      wrongType('a', 'vc+sd-jwt', '2026-10-26T05:00:00Z'),
      wrongType('b', 'ldp_vc', '2026-10-26T06:00:00Z'),
      report({ runId: 'ok', verdict: 'PASS', passed: true }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      category: 'interop',
      target: 'inji/inji-verify',
      title: 'Inji Verify 0.18.2 accepts a presentation with T-WRONG-TYPE (wrong credential type)',
      formats: ['vc+sd-jwt', 'ldp_vc'],
    });
    expect(clusters[0]!.runs.map((r) => r.runId)).toEqual(['b', 'a']);
  });

  it('separates tunnel failures and holder refusals from interop gaps', () => {
    const tunnel = report({
      runId: 't',
      error: { step: 'oid4vci.credential', message: 'POST https://red-alfred.trycloudflare.com:8443/v1/certify/issuance/credential failed: fetch failed' },
    });
    const declined = report({
      runId: 'd',
      wallet: p('wallet', 'inji-wallet-mobile', 'Inji Wallet (mobile)', '1.0.0-alpha.1'),
      error: { step: 'oid4vp.response', message: 'The wallet declined: access_denied' },
    });
    expect(signatureOf(tunnel)).toMatchObject({ category: 'infrastructure', component: 'inji-certify', target: 'inji/inji-certify' });
    expect(signatureOf(declined).category).toBe('holder');
    expect(clusterFailures([tunnel, declined, wrongType('w', 'ldp_vc', 'x')]).map((c) => c.category)).toEqual([
      'interop',
      'infrastructure',
      'holder',
    ]);
  });

  it('points a mock module at this repository', () => {
    const r = report({ runId: 'm', verifier: p('verifier', 'mock-verifier', 'Mock verifier', '0.1.0'), observedOutcome: 'INVALID' });
    expect(signatureOf(r)).toMatchObject({ target: 'this repository (playground mock)', key: 'outcome|mock-verifier@0.1.0|vc+sd-jwt|VALID->INVALID' });
  });

  it('normalizes run-specific values out of errors', () => {
    expect(
      normalizeError('GET https://a-b.trycloudflare.com/v1/verify/vp-result/txn_93d3d8b1e3ec4b39a01d9a67d6c55c06 → 404 after 12034 ms'),
    ).toBe('GET <origin>/v1/verify/vp-result/<id> → <n> after <n> ms');
  });
});

describe('renderIssueDraft', () => {
  it('fills the plan §16.2 template with a repro matrix and decoded evidence', () => {
    const [c] = clusterFailures([wrongType('run-1', 'ldp_vc', '2026-10-26T05:00:00Z')]);
    const requestObject = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ presentation_definition: { id: 'pd' } })).toString('base64url')}.sig`;
    const ex = (seq: number, step: Exchange['step'], body: Partial<Exchange>): Exchange => ({
      id: `e${seq}`,
      seq,
      ts: '',
      component: 'verify',
      method: 'GET',
      url: `https://verify.localhost:8443/${step}`,
      status: 200,
      step,
      request: { headers: {} },
      correlationKeys: [],
      outOfBand: false,
      ...body,
    });
    const md = renderIssueDraft(c!, [
      ex(1, 'did.resolution', {}),
      ex(2, 'oid4vp.request_object', { response: { headers: {}, body: requestObject } }),
      ex(3, 'oid4vp.response', {
        method: 'POST',
        request: { headers: {}, body: 'vp_token=%7B%22a%22%3A1%7D&state=s', contentType: 'application/x-www-form-urlencoded' },
        tampered: { ruleId: 'T-WRONG-TYPE', diff: 'Presented a credential that does not satisfy the request' },
      }),
    ]);
    expect(md).toContain('<!-- target: inji/inji-verify · category: interop · 1 run(s) -->');
    expect(md).toContain(
      '  - { issuer: inji-certify, wallet: mock-wallet, verifier: inji-verify, format: ldp_vc, credentialConfigurationId: FarmerCredentialSdJwt, mode: full, tamper: { id: T-WRONG-TYPE }, expectedOutcome: INVALID }',
    );
    expect(md).toContain('The verifier asks for a credential type the wallet does not hold');
    expect(md).toContain('The verifier returned Valid.\n');
    expect(md).toContain('"presentation_definition"');
    expect(md).toContain('vp_token: {"a":1}');
    expect(md).toContain('Tampered by the playground (T-WRONG-TYPE)');
    expect(md).not.toContain('did.resolution');
    expect(renderGapIndex([c!], 'now')).toContain(`[${slug(c!)}.md](${slug(c!)}.md)`);
  });

  it("decodes an SD-JWT presentation's key-binding JWT", () => {
    const kb = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ nonce: 'old' })).toString('base64url')}.sig`;
    const body = new URLSearchParams({ vp_token: `eyJ.eyJ.s~WyJ~${kb}` }).toString();
    expect(readableBody(body, 'application/x-www-form-urlencoded')).toContain('Key-binding JWT payload:\n{\n  "nonce": "old"\n}');
  });

  it('leaves bodies it cannot decode as they are', () => {
    expect(readableBody('{"a":1}', 'application/json')).toBe('{"a":1}');
    expect(readableBody('not.a.jwt')).toBe('not.a.jwt');
  });
});
