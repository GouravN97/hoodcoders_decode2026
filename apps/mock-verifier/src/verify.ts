// VpValidationPipeline (plan §8.4): every check the verifier makes on a direct_post response, in
// order, each with its own result. The outcome follows from which stage failed:
//   response shape, state                         → REJECTED (the response is not usable)
//   submission, requested credential, signature,
//   disclosures, holder binding                   → INVALID
//   validity period (expired)                      → EXPIRED
// SD-JWT VC (vc+sd-jwt, dc+sd-jwt) and ISO mDoc (mso_mdoc, a DeviceResponse with an ISO 18013-7
// Annex B session transcript). A JSON-LD presentation is reported as not checked.
import {
  describeField,
  disclosedClaims,
  formatAllowed,
  parseDeviceResponse,
  parseMdoc,
  parseSdJwt,
  printable,
  unmetFields,
  verifyMdoc,
  verifySdJwt,
  type ParsedMdoc,
  type PresentationSubmission,
  type StageResult,
} from '@playground/protocol-core';
import {
  CredentialFormatSchema,
  type CredentialFormat,
  type MockVerifierResult,
  type VerificationOutcome,
} from '@playground/shared';
import type { Transaction } from './transactions.ts';

export interface VerifyContext {
  clientId: string;
  trustedIssuers: string[];
  /** DER certificates trusted as mDoc issuers. */
  trustedMdocCertificates?: Uint8Array[];
  /** The response_uri of a request: the mDoc session transcript is bound to it. */
  responseUriFor?: (requestId: string) => string;
  now?: Date;
}

const stage = (id: string, label: string, status: StageResult['status'], message: string): StageResult => ({
  id,
  label,
  status,
  message,
});

const REJECTING = ['response-shape', 'state'];
const INVALIDATING = ['submission', 'requested-credential', 'format', 'issuer-signature', 'disclosures', 'digests', 'holder-binding'];

/** The outcome the stages add up to. */
export function outcomeOf(stages: StageResult[]): VerificationOutcome {
  const failed = (ids: string[]) => stages.some((s) => s.status === 'fail' && ids.includes(s.id));
  if (failed(REJECTING)) return 'REJECTED';
  if (stages.some((s) => s.id === 'format' && s.status === 'fail' && s.message.includes('not checked'))) return 'ERROR';
  if (failed(INVALIDATING)) return 'INVALID';
  const validity = stages.find((s) => s.id === 'validity');
  if (validity?.status === 'fail') return validity.message.startsWith('Expired') ? 'EXPIRED' : 'INVALID';
  return 'VALID';
}

/** A vp_token or credential that is CBOR (base64url, no SD-JWT separator, not JSON). */
const looksLikeMdoc = (token: string) => !token.includes('~') && !token.trim().startsWith('{') && !token.includes('.');

/** The elements a presented mDoc discloses, as Presentation Exchange paths see them. */
function mdocView(m: ParsedMdoc): Record<string, unknown> {
  const claims: Record<string, Record<string, unknown>> = {};
  for (const e of m.elements) (claims[e.namespace] ??= {})[e.elementIdentifier] = printable(e.elementValue);
  return claims;
}

function credentialFacts(token: string): Pick<MockVerifierResult, 'format' | 'credentialType' | 'issuer'> {
  if (looksLikeMdoc(token)) {
    for (const read of [() => parseDeviceResponse(token).documents[0]!, () => parseMdoc(token)]) {
      try {
        return { format: 'mso_mdoc', credentialType: read().docType };
      } catch {
        /* try the other shape */
      }
    }
    return {};
  }
  try {
    const sd = parseSdJwt(token);
    const format = CredentialFormatSchema.safeParse(sd.header.typ);
    return {
      ...(format.success ? { format: format.data } : {}),
      ...(typeof sd.payload.vct === 'string' ? { credentialType: sd.payload.vct } : {}),
      ...(typeof sd.payload.iss === 'string' ? { issuer: sd.payload.iss } : {}),
    };
  } catch {
    return {};
  }
}

function result(stages: StageResult[], token: string | undefined, ctx: VerifyContext, transactionId?: string): MockVerifierResult {
  return {
    ...(transactionId ? { transactionId } : {}),
    outcome: outcomeOf(stages),
    stages,
    ...(token ? credentialFacts(token) : {}),
    verifiedAt: (ctx.now ?? new Date()).toISOString(),
  };
}

/** Checks a direct_post body against the transaction it answers. */
export async function verifyResponse(tx: Transaction, fields: URLSearchParams, ctx: VerifyContext): Promise<MockVerifierResult> {
  const stages: StageResult[] = [];
  const vpToken = fields.get('vp_token');
  const done = () => result(stages, vpToken ?? undefined, ctx, tx.transactionId);

  const error = fields.get('error');
  if (error) {
    stages.push(stage('response-shape', 'Response shape', 'fail', `The wallet answered with error=${error}${fields.get('error_description') ? ` (${fields.get('error_description')})` : ''}`));
    return done();
  }
  if (!vpToken) {
    stages.push(stage('response-shape', 'Response shape', 'fail', 'No vp_token in the response'));
    return done();
  }
  let submission: PresentationSubmission | undefined;
  try {
    submission = JSON.parse(fields.get('presentation_submission') ?? '') as PresentationSubmission;
  } catch {
    stages.push(stage('response-shape', 'Response shape', 'fail', 'presentation_submission is missing or not JSON'));
    return done();
  }
  stages.push(stage('response-shape', 'Response shape', 'pass', 'vp_token and presentation_submission present'));

  const state = fields.get('state');
  stages.push(
    state === tx.requestId
      ? stage('state', 'State', 'pass', 'state matches the request')
      : stage('state', 'State', 'fail', `state is ${JSON.stringify(state)}, the request sent ${JSON.stringify(tx.requestId)}`),
  );
  if (stages.at(-1)!.status === 'fail') return done();

  const pd = tx.presentationDefinition;
  const entry = submission.descriptor_map?.[0];
  const descriptor = pd.input_descriptors.find((d) => d.id === entry?.id);
  const submissionProblems = [
    submission.definition_id !== pd.id && `definition_id is ${JSON.stringify(submission.definition_id)}, expected ${JSON.stringify(pd.id)}`,
    !descriptor && `descriptor_map names ${JSON.stringify(entry?.id)}, which is not an input descriptor of the request`,
    entry && entry.path !== '$' && `descriptor path is ${entry.path}, expected $`,
  ].filter(Boolean);
  stages.push(
    submissionProblems.length > 0
      ? stage('submission', 'Presentation submission', 'fail', submissionProblems.join('; '))
      : stage('submission', 'Presentation submission', 'pass', `Maps to input descriptor ${descriptor!.id} as ${entry!.format}`),
  );

  if (vpToken.trim().startsWith('{')) {
    stages.push(stage('format', 'Credential format', 'fail', 'JSON-LD presentations are not checked by this mock verifier (SD-JWT VC and mDoc only)'));
    return done();
  }

  if (looksLikeMdoc(vpToken)) {
    let doc: ParsedMdoc;
    try {
      const response = parseDeviceResponse(vpToken);
      if (response.status !== undefined && response.status !== 0) throw new Error(`DeviceResponse status is ${response.status}`);
      doc = response.documents[0]!;
    } catch (e) {
      stages.push(stage('format', 'mDoc format', 'fail', `vp_token is not a usable DeviceResponse: ${(e as Error).message}`));
      return done();
    }
    if (descriptor) {
      const unmet = unmetFields(mdocView(doc), descriptor);
      const problems = [
        !formatAllowed(descriptor, 'mso_mdoc') && `format mso_mdoc is not one the request accepts (${Object.keys(descriptor.format ?? {}).join(', ')})`,
        doc.docType !== descriptor.id && `docType ${doc.docType}, the request asked for ${descriptor.id}`,
        ...unmet.map((f) => `requested ${describeField(f)}, not disclosed`),
        entry && entry.format !== 'mso_mdoc' && `submission says ${entry.format}, the token is mso_mdoc`,
      ].filter(Boolean);
      stages.push(
        problems.length > 0
          ? stage('requested-credential', 'Requested credential', 'fail', problems.join('; '))
          : stage('requested-credential', 'Requested credential', 'pass', `${doc.docType} with the requested elements, for input descriptor ${descriptor.id}`),
      );
    }
    stages.push(
      ...(await verifyMdoc(doc, {
        handover: { clientId: ctx.clientId, responseUri: ctx.responseUriFor?.(tx.requestId) ?? '', nonce: tx.nonce },
        trustedCertificates: ctx.trustedMdocCertificates ?? [],
        ...(ctx.now ? { now: ctx.now } : {}),
      })),
    );
    return done();
  }

  // What was presented against what was asked for: format and field constraints (e.g. the vct).
  if (descriptor) {
    try {
      const sd = parseSdJwt(vpToken);
      const typ = String(sd.header.typ ?? '') as CredentialFormat;
      const unmet = unmetFields(disclosedClaims(sd), descriptor);
      const problems = [
        !formatAllowed(descriptor, typ) && `format ${typ} is not one the request accepts (${Object.keys(descriptor.format ?? {}).join(', ')})`,
        ...unmet.map((f) => `requested ${describeField(f)}, not met`),
        entry && entry.format !== typ && `submission says ${entry.format}, the token is ${typ}`,
      ].filter(Boolean);
      stages.push(
        problems.length > 0
          ? stage('requested-credential', 'Requested credential', 'fail', problems.join('; '))
          : stage('requested-credential', 'Requested credential', 'pass', `${typ} credential satisfies input descriptor ${descriptor.id}`),
      );
    } catch {
      /* the SD-JWT stages below report the parse error */
    }
  }

  stages.push(
    ...(await verifySdJwt(vpToken, {
      nonce: tx.nonce,
      audience: ctx.clientId,
      trustedIssuers: ctx.trustedIssuers,
      ...(ctx.now ? { now: ctx.now } : {}),
    })),
  );
  return done();
}

/** A credential on its own: signature, disclosures, issuer trust and validity, no holder binding. */
export async function verifyCredentialOnly(credential: string, ctx: VerifyContext): Promise<MockVerifierResult> {
  // A presentation's key-binding JWT is not part of the credential.
  const token = credential.trim().replace(/~[^~]+$/, '~');
  if (token.startsWith('{')) {
    const stages = [stage('format', 'Credential format', 'fail', 'JSON-LD credentials are not checked by this mock verifier (SD-JWT VC and mDoc only)')];
    return result(stages, undefined, ctx);
  }
  if (looksLikeMdoc(credential.trim())) {
    try {
      const stages = await verifyMdoc(parseMdoc(credential.trim()), {
        trustedCertificates: ctx.trustedMdocCertificates ?? [],
        ...(ctx.now ? { now: ctx.now } : {}),
      });
      return result(stages, credential.trim(), ctx);
    } catch (e) {
      return result([stage('format', 'mDoc format', 'fail', (e as Error).message)], undefined, ctx);
    }
  }
  const stages = await verifySdJwt(token, {
    trustedIssuers: ctx.trustedIssuers,
    ...(ctx.now ? { now: ctx.now } : {}),
  });
  return result(stages, token, ctx);
}
