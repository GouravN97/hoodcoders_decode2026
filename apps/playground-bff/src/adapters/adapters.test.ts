import { describe, expect, it } from 'vitest';
import {
  authorizationRequestUri,
  mapVpResult,
  mapVpResultError,
  presentationDefinitionFor,
  transactionIdFor,
} from './inji-verify.ts';
import { qr, qrVersionFor } from './wallets.ts';

describe('Inji Verify adapter', () => {
  it('maps per-credential statuses to outcomes', () => {
    expect(
      mapVpResult({ vpResultStatus: 'SUCCESS', vcResults: [{ verificationStatus: 'SUCCESS' }] })
        .outcome,
    ).toBe('VALID');
    expect(
      mapVpResult({ vpResultStatus: 'FAILED', vcResults: [{ verificationStatus: 'INVALID' }] })
        .outcome,
    ).toBe('INVALID');
    expect(
      mapVpResult({ vpResultStatus: 'FAILED', vcResults: [{ verificationStatus: 'EXPIRED' }] })
        .outcome,
    ).toBe('EXPIRED');
    // Credentials fine but the holder proof failed.
    expect(
      mapVpResult({ vpResultStatus: 'FAILED', vcResults: [{ verificationStatus: 'SUCCESS' }] }),
    ).toMatchObject({
      outcome: 'INVALID',
      reason: 'vpResultStatus FAILED',
    });
  });

  it('maps error bodies: wallet errors are rejections, bad tokens are invalid', () => {
    expect(
      mapVpResultError('{"errorCode":"access_denied","errorMessage":"No matching credential"}')
        ?.outcome,
    ).toBe('REJECTED');
    expect(mapVpResultError('{"errorCode":"INVALID_VP_TOKEN"}')?.outcome).toBe('INVALID');
    expect(mapVpResultError('not json')).toBeUndefined();
  });

  it('builds the QR payload like the Inji Verify SDK', () => {
    const byRef = authorizationRequestUri('did:web:verify.test', {
      transactionId: 't',
      requestId: 'r',
      requestUri: 'https://verify.test/v1/verify/vp-request/r',
    });
    expect(new URL(byRef).searchParams.get('request_uri')).toBe(
      'https://verify.test/v1/verify/vp-request/r',
    );
    const byValue = new URL(
      authorizationRequestUri('verifier', {
        transactionId: 't',
        requestId: 'req_1',
        authorizationDetails: {
          clientId: 'verifier',
          nonce: 'n',
          responseUri: 'https://v/direct-post',
          presentationDefinition: { id: 'pd' },
        },
      }),
    ).searchParams;
    expect(byValue.get('state')).toBe('req_1');
    expect(JSON.parse(byValue.get('presentation_definition')!)).toEqual({ id: 'pd' });
  });

  it('asks for the Farmer credential by vct (SD-JWT) or type (JSON-LD)', () => {
    const sd = JSON.stringify(
      presentationDefinitionFor({
        id: 'x',
        format: 'vc+sd-jwt',
        credentialType: 'FarmerCredentialSdJwt',
        purpose: 'p',
      }),
    );
    expect(sd).toContain('"$.vct"');
    expect(sd).toContain('FarmerCredentialSdJwt');
    const ldp = JSON.stringify(
      presentationDefinitionFor({
        id: 'x',
        format: 'ldp_vc',
        credentialType: 'FarmerCredential',
        purpose: 'p',
      }),
    );
    expect(ldp).toContain('Ed25519Signature2020');
    expect(ldp).not.toContain('RsaSignature2018');
  });

  it('keeps transaction ids within Inji Verify’s 40-character column', () => {
    expect(transactionIdFor('2e4b970a-687c-4d79-a8ea-36d26296c70b').length).toBeLessThanOrEqual(40);
  });
});

describe('QR delivery', () => {
  it('reports size and QR version', () => {
    expect(qrVersionFor(17)).toBe(1);
    expect(qrVersionFor(18)).toBe(2);
    expect(qr('abc', 'hint')).toMatchObject({ kind: 'qr', bytes: 3, qrVersion: 1 });
  });
});
