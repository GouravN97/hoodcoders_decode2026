import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ImplementationDescriptor, RunConfig } from '@playground/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AnimoPlaygroundIssuerAdapter,
  HoviPlaygroundIssuerAdapter,
} from './external-playgrounds.ts';

let server: Server;
let baseUrl = '';
const requests: Array<{ path: string; headers: IncomingMessage['headers']; body: unknown }> = [];

async function jsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://test').pathname;
    const body = req.method === 'POST' ? await jsonBody(req) : undefined;
    requests.push({ path, headers: req.headers, body });
    res.setHeader('content-type', 'application/json');
    if (path === '/api/issuers') {
      res.end(
        JSON.stringify([
          {
            name: 'Bundeszentralamt fur Steuern',
            credentials: [
              {
                display: { name: 'Tax-ID' },
                formats: { 'dc+sd-jwt': 'tax-id-sd-jwt', mso_mdoc: 'tax-id-mdoc' },
              },
            ],
          },
          {
            name: 'Bundesdruckerei',
            credentials: [
              {
                display: { name: 'EUDI PID' },
                formats: {
                  'dc+sd-jwt': 'eudi-pid-sd-jwt-bdr',
                  mso_mdoc: 'eudi-pid-mdoc-bdr',
                  jwt_vc_json: 'eudi-pid-jwt-bdr',
                },
              },
            ],
          },
        ]),
      );
      return;
    }
    if (path === '/api/offers/create') {
      res.end(
        JSON.stringify({
          credentialOffer:
            'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fexample.test%2Foffer',
          issuanceSession: {
            id: 'animo-session',
            credentialOfferId: 'animo-offer',
            expiresAt: '2026-10-24T12:30:00.000Z',
          },
        }),
      );
      return;
    }
    if (path === '/functions/v1/issue-credential') {
      res.end(
        JSON.stringify({
          request_uri:
            'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fexample.test%2Fhovi-offer',
          sessionId: 'hovi-session',
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const descriptor = (id: string, adapter: string): ImplementationDescriptor => ({
  id,
  role: 'issuer',
  displayName: id,
  vendor: 'external',
  adapter,
  publicUrl: baseUrl,
  capabilities: {
    formats: ['dc+sd-jwt', 'mso_mdoc'],
    proofSuites: ['ES256'],
    grantTypes: ['pre-authorized_code'],
    vciProfiles: ['oid4vci-1.0'],
    deliveryChannels: ['qr'],
    automation: 'headless',
    supportsTamper: false,
  },
});

const config = (credentialConfigurationId: string): RunConfig => ({
  mode: 'issue-only',
  issuerId: 'external',
  walletId: 'wallet',
  verifierId: 'verifier',
  format: credentialConfigurationId.includes('mdoc') ? 'mso_mdoc' : 'dc+sd-jwt',
  credentialConfigurationId,
  grantType: 'pre-authorized_code',
  presentationFlow: 'cross-device-qr',
  expectedOutcome: 'VALID',
});

describe('external issuer playground adapters', () => {
  it('creates a Hovi PID offer with its public client credentials', async () => {
    const adapter = new HoviPlaygroundIssuerAdapter(
      descriptor('hovi-playground', 'HoviPlaygroundIssuerAdapter'),
      { supabaseUrl: baseUrl, anonKey: 'public-anon-key' },
    );
    expect(await adapter.listCredentialConfigurations()).toHaveLength(2);
    const handle = await adapter.prepareIssuance({
      runId: 'run-hovi',
      config: config('pid-mdoc'),
      signal: new AbortController().signal,
    });
    expect(handle).toMatchObject({
      offerId: 'hovi-session',
      observation: 'manual',
    });
    expect(handle.offerUri).toMatch(/^openid-credential-offer:/);
    const request = requests.find((item) => item.path === '/functions/v1/issue-credential')!;
    expect(request.headers.apikey).toBe('public-anon-key');
    expect(request.body).toMatchObject({ credentialType: 'pid-mdoc', ecosystem: 'eudiw' });
  });

  it('discovers Animo PID configurations and creates the simplest offer', async () => {
    const adapter = new AnimoPlaygroundIssuerAdapter(
      descriptor('animo-playground', 'AnimoPlaygroundIssuerAdapter'),
    );
    // Every published credential in a supported format, PID first, with its type where known.
    const configs = await adapter.listCredentialConfigurations();
    expect(configs).toEqual([
      expect.objectContaining({ id: 'eudi-pid-sd-jwt-bdr', format: 'dc+sd-jwt', credentialType: 'urn:eudi:pid:1' }),
      expect.objectContaining({ id: 'eudi-pid-mdoc-bdr', format: 'mso_mdoc', credentialType: 'eu.europa.ec.eudi.pid.1' }),
      expect.objectContaining({
        id: 'tax-id-sd-jwt',
        format: 'dc+sd-jwt',
        displayName: 'Bundeszentralamt fur Steuern · Tax-ID — SD-JWT VC',
        credentialType: 'https://example.eudi.ec.europa.eu/tax-id/1',
      }),
      expect.objectContaining({ id: 'tax-id-mdoc', format: 'mso_mdoc', credentialType: 'eu.europa.ec.eudi.taxid.1' }),
    ]);
    expect(configs.map((c) => c.id)).not.toContain('eudi-pid-jwt-bdr');
    const handle = await adapter.prepareIssuance({
      runId: 'run-animo',
      config: config('eudi-pid-sd-jwt-bdr'),
      signal: new AbortController().signal,
    });
    expect(handle).toMatchObject({
      offerId: 'animo-offer',
      expiresAt: '2026-10-24T12:30:00.000Z',
      observation: 'manual',
    });
    const request = requests.find((item) => item.path === '/api/offers/create')!;
    expect(request.body).toEqual({
      credentialSupportedIds: ['eudi-pid-sd-jwt-bdr'],
      authorization: 'none',
      deferBy: 'none',
      requireDpop: false,
      requireWalletAttestation: false,
      requireKeyAttestation: false,
    });
  });
});
