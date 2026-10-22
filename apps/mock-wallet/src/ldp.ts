// JSON-LD verifiable presentations with a JsonWebSignature2020 (ES256, detached JWS) holder proof,
// the way vc-verifier 1.8 (inside Inji Verify 0.18) checks them:
//   signing input = SHA-256(URDNA2015(proof options)) || SHA-256(URDNA2015(presentation without proof))
//   jws           = <header {"alg":"ES256","b64":false,"crit":["b64"]}>..<ES256 over header + "." + input>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import jsonld from 'jsonld';
import { base64url } from 'jose';
import { signEs256, type HolderKey } from './keys.ts';

const CREDENTIALS_V1 = 'https://www.w3.org/2018/credentials/v1';
const JWS_2020_V1 = 'https://w3id.org/security/suites/jws-2020/v1';

const bundled = (file: string) =>
  JSON.parse(readFileSync(new URL(`./contexts/${file}`, import.meta.url), 'utf8')) as object;

/** Contexts shipped with the wallet; anything else (e.g. the issuer's own context) is fetched once and cached. */
const contexts = new Map<string, object>([
  [CREDENTIALS_V1, bundled('credentials-v1.json')],
  [JWS_2020_V1, bundled('jws-2020-v1.json')],
  ['https://w3id.org/security/suites/ed25519-2020/v1', bundled('ed25519-signature-2020-v1.json')],
]);

async function documentLoader(url: string) {
  let document = contexts.get(url);
  if (!document) {
    const res = await fetch(url, {
      headers: { accept: 'application/ld+json, application/json' },
      signal: AbortSignal.timeout(10_000),
    }).catch((e: Error) => {
      throw new Error(
        `Cannot load JSON-LD context ${url}: ${(e.cause as Error | undefined)?.message ?? e.message}`,
      );
    });
    if (!res.ok) throw new Error(`Cannot load JSON-LD context ${url}: HTTP ${res.status}`);
    document = (await res.json()) as object;
    contexts.set(url, document);
  }
  return { contextUrl: undefined, documentUrl: url, document };
}

async function canonicalHash(doc: object): Promise<Buffer> {
  const nquads = await jsonld.canonize(doc, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads',
    documentLoader,
    safe: false,
  } as jsonld.Options.Normalize);
  return createHash('sha256').update(nquads).digest();
}

export async function signPresentation(opts: {
  credential: object;
  holder: HolderKey;
  challenge: string;
  domain: string;
  created?: Date;
}): Promise<Record<string, unknown>> {
  const context = [CREDENTIALS_V1, JWS_2020_V1];
  const presentation = {
    '@context': context,
    type: ['VerifiablePresentation'],
    holder: opts.holder.did,
    verifiableCredential: [opts.credential],
  };
  const proofOptions = {
    type: 'JsonWebSignature2020',
    created: (opts.created ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    verificationMethod: opts.holder.kid,
    proofPurpose: 'authentication',
    challenge: opts.challenge,
    domain: opts.domain,
  };
  const input = Buffer.concat([
    await canonicalHash({ '@context': context, ...proofOptions }),
    await canonicalHash(presentation),
  ]);
  const header = base64url.encode(JSON.stringify({ alg: 'ES256', b64: false, crit: ['b64'] }));
  const signature = signEs256(
    opts.holder,
    Buffer.concat([Buffer.from(`${header}.`, 'ascii'), input]),
  );
  return {
    ...presentation,
    proof: { ...proofOptions, jws: `${header}..${base64url.encode(signature)}` },
  };
}
