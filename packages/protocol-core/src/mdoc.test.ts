import { readFileSync } from 'node:fs';
import { exportJWK, generateKeyPair, importPKCS8, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildDeviceResponse,
  checkDigests,
  createMdoc,
  mdocObservations,
  parseDeviceResponse,
  parseMdoc,
  pemToDer,
  verifyMdoc,
  type Oid4vpHandoverInput,
} from './mdoc';
import { TEST_MDOC_ISSUER_CERT_PEM, TEST_MDOC_ISSUER_KEY_PEM } from './testIssuer';

const status = (stages: Array<{ id: string; status: string }>) => Object.fromEntries(stages.map((s) => [s.id, s.status]));
const DOCTYPE = 'org.iso.18013.5.1.mDL';
const handover: Oid4vpHandoverInput = {
  clientId: 'did:web:verify.test:mock-verifier',
  responseUri: 'https://verify.test/mock-verifier/oid4vp/response/req_1',
  nonce: 'nonce-1',
};

let issuerKey: CryptoKey;
let device: Awaited<ReturnType<typeof generateKeyPair>>;
const cert = pemToDer(TEST_MDOC_ISSUER_CERT_PEM)[0]!;

beforeAll(async () => {
  issuerKey = (await importPKCS8(TEST_MDOC_ISSUER_KEY_PEM, 'ES256')) as CryptoKey;
  device = await generateKeyPair('ES256', { extractable: true });
});

const issue = async (over: { validUntil?: Date; wrapped?: boolean } = {}) =>
  createMdoc({
    docType: DOCTYPE,
    nameSpaces: { 'org.iso.18013.5.1': { family_name: 'Kumar', given_name: 'Ramesh', birth_date: '1984-03-12' } },
    issuerKey,
    issuerCertificate: cert,
    deviceJwk: await exportJWK(device.publicKey),
    validFrom: new Date(Date.now() - 86_400_000),
    validUntil: over.validUntil ?? new Date(Date.now() + 86_400_000),
    ...(over.wrapped ? { wrapped: true } : {}),
  });

describe('mDoc', () => {
  it('reads the mock mDL Inji Certify 0.14.0 issued and reports how it differs from ISO 18013-5', async () => {
    const m = parseMdoc(readFileSync(new URL('./fixtures/certify-0.14.0-mock-mdl.mdoc', import.meta.url), 'utf8'));
    expect(m).toMatchObject({ docType: DOCTYPE, shape: 'wrapped' });
    expect(m.elements.map((e) => e.elementIdentifier)).toContain('family_name');
    expect((await checkDigests(m)).every((e) => e.digestOk)).toBe(true);
    const stages = await verifyMdoc(m, { now: new Date('2026-10-26T00:00:00Z') });
    expect(status(stages)).toMatchObject({ format: 'warn', 'issuer-signature': 'pass', digests: 'pass', 'holder-binding': 'skip', validity: 'pass' });
    expect(mdocObservations(m)).toEqual([
      expect.stringContaining('{docType, issuerSigned}'),
      expect.stringContaining('driving_privileges is a string'),
    ]);
    expect(m.mso.taggedDates).toBe(true);
  });

  it('presents an mDoc as a DeviceResponse that the verifier accepts end to end', async () => {
    const vpToken = await buildDeviceResponse({ credential: await issue({ wrapped: true }), deviceKey: device.privateKey as CryptoKey, handover });
    const { documents, status: st } = parseDeviceResponse(vpToken);
    expect(st).toBe(0);
    const stages = await verifyMdoc(documents[0]!, { handover, trustedCertificates: [cert] });
    expect(Object.values(status(stages)).every((s) => s === 'pass')).toBe(true);
  });

  it('discloses only the requested elements, and their digests still verify', async () => {
    const vpToken = await buildDeviceResponse({
      credential: await issue(),
      deviceKey: device.privateKey as CryptoKey,
      handover,
      disclose: { 'org.iso.18013.5.1': ['family_name'] },
    });
    const doc = parseDeviceResponse(vpToken).documents[0]!;
    expect(doc.elements.map((e) => e.elementIdentifier)).toEqual(['family_name']);
    expect(status(await verifyMdoc(doc, { handover }))).toMatchObject({ digests: 'pass', 'holder-binding': 'pass', 'issuer-trust': 'warn' });
  });

  it('fails holder binding for another request’s nonce or client_id', async () => {
    const vpToken = await buildDeviceResponse({ credential: await issue(), deviceKey: device.privateKey as CryptoKey, handover });
    const doc = parseDeviceResponse(vpToken).documents[0]!;
    expect(status(await verifyMdoc(doc, { handover: { ...handover, nonce: 'other' } }))['holder-binding']).toBe('fail');
    expect(status(await verifyMdoc(doc, { handover: { ...handover, clientId: 'did:web:evil' } }))['holder-binding']).toBe('fail');
  });

  it('fails the digests of an edited element and the signature of a flipped one, and reports expiry', async () => {
    const m = parseMdoc(await issue());
    const edited = { ...m, elements: m.elements.map((e, i) => (i === 0 ? { ...e, itemBytes: e.itemBytes.map((b, j) => (j === e.itemBytes.length - 1 ? b ^ 1 : b)) } : e)) };
    expect(status(await verifyMdoc(edited)).digests).toBe('fail');
    const sig = m.issuerAuth.signature.slice();
    sig[10] = sig[10]! ^ 0xff;
    expect(status(await verifyMdoc({ ...m, issuerAuth: { ...m.issuerAuth, signature: sig } }))['issuer-signature']).toBe('fail');
    const expired = parseMdoc(await issue({ validUntil: new Date(Date.now() - 3_600_000) }));
    expect((await verifyMdoc(expired)).find((s) => s.id === 'validity')).toMatchObject({ status: 'fail', message: expect.stringMatching(/^Expired at/) });
  });
});
