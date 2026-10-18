// Plays a run as the BFF would: each step writes to the mock db and publishes the same
// RunEventMap events the real RunEventsGateway sends. Human-in-the-loop wallets wait for the
// "I can see the credential" confirmation, exactly like the real ManualEvidenceService.
import {
  ProtocolStep,
  type ArtifactKind,
  type CatalogEntry,
  type CredentialFormat,
  type DeliveryInstruction,
  type DeliveryPurpose,
  type EvidenceKind,
  type ExchangeWithDecoded,
  type InteropVerdict,
  type RunEvent,
  type RunState,
  type RunStep,
  type StepError,
  type StepStatus,
  type VerificationOutcome,
} from '@playground/shared';
import { simulatedEvents } from '../realtime';
import { db, type MockRunRecord } from './db';
import { buildFixtures, ISSUER_URL, VERIFIER_URL, type RunFixtures, type Scenario } from './fixtures';

class Cancelled extends Error {}

const SPEED_KEY = 'playground.simSpeed';

/** `?simSpeed=10` on any page speeds up mock runs for demos and e2e tests. */
export function rememberSimSpeedFromUrl() {
  try {
    const v = new URLSearchParams(location.search).get('simSpeed');
    if (v) sessionStorage.setItem(SPEED_KEY, v);
  } catch {
    /* ignore */
  }
}

function simSpeed(): number {
  try {
    const v = Number(sessionStorage.getItem(SPEED_KEY));
    return v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

export function scenarioFor(expected: VerificationOutcome, label: string | undefined): Scenario {
  const known: Scenario[] = ['valid', 'invalid-signature', 'expired', 'fail-at-token', 'timeout'];
  if (label && (known as string[]).includes(label)) return label as Scenario;
  if (expected === 'INVALID') return 'invalid-signature';
  if (expected === 'EXPIRED') return 'expired';
  return 'valid';
}

const OUTCOME_FROM_INJI: Record<string, VerificationOutcome> = {
  SUCCESS: 'VALID',
  INVALID: 'INVALID',
  EXPIRED: 'EXPIRED',
};

const byteLength = (s: string | undefined) => (s ? new TextEncoder().encode(s).length : 0);

/** Smallest QR version (byte mode, error correction L) that fits the payload. */
function qrVersionFor(bytes: number): number {
  const capacity = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858];
  const i = capacity.findIndex((c) => c >= bytes);
  return i === -1 ? 40 : i + 1;
}

class RunSimulation {
  private seq = 0;
  private readonly speed = simSpeed();

  constructor(
    private readonly record: MockRunRecord,
    private readonly wallet: CatalogEntry,
    private readonly fx: RunFixtures,
    private readonly scenario: Scenario,
  ) {}

  private get run() {
    return this.record.run;
  }

  private publish(event: RunEvent) {
    simulatedEvents.publish(event);
  }

  private get human() {
    return this.wallet.capabilities.automation === 'human-in-the-loop';
  }

  private get walletName() {
    return this.wallet.id === 'inji-web' ? 'mimoto' : 'wallet';
  }

  async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms / this.speed));
    if (this.record.cancelled) throw new Cancelled();
  }

  status(state: RunState) {
    const at = new Date().toISOString();
    this.run.state = state;
    if (state === 'Reported' || state === 'Aborted' || state === 'Cancelled') this.run.finishedAt = at;
    this.publish({ type: 'run.status', runId: this.run.id, state, at });
  }

  step(
    step: string,
    status: StepStatus,
    extra: { evidenceKind?: EvidenceKind; exchangeId?: string; error?: StepError } = {},
  ) {
    const i = this.run.steps.findIndex((s) => s.step === step);
    const prev = this.run.steps[i];
    if (!prev) return;
    const now = new Date();
    const next: RunStep = { ...prev, status, ...extra };
    if (status === 'active') next.startedAt = now.toISOString();
    if (status !== 'active' && status !== 'pending') {
      next.startedAt ??= now.toISOString();
      next.endedAt = now.toISOString();
      next.durationMs = now.getTime() - new Date(next.startedAt).getTime();
    }
    this.run.steps[i] = next;
    this.publish({ type: 'run.step', runId: this.run.id, step: next });
  }

  exchange(e: {
    component: string;
    from: string;
    method: string;
    url: string;
    status?: number;
    step: ProtocolStep;
    reqBody?: string;
    reqContentType?: string;
    reqHeaders?: Record<string, string>;
    resBody?: string;
    resContentType?: string;
    outOfBand?: boolean;
    correlationKeys?: string[];
    artifactKinds?: ArtifactKind[];
  }): string {
    const id = crypto.randomUUID();
    const ex: ExchangeWithDecoded = {
      id,
      runId: this.run.id,
      seq: ++this.seq,
      ts: new Date().toISOString(),
      component: e.component,
      from: e.from,
      method: e.method,
      url: e.url,
      ...(e.status !== undefined ? { status: e.status } : {}),
      latencyMs: e.outOfBand ? 0 : Math.round(20 + Math.random() * 180),
      step: e.step,
      request: {
        headers: {
          ...(e.reqContentType ? { 'content-type': e.reqContentType } : {}),
          ...(e.outOfBand ? {} : { 'user-agent': e.from === 'bff' ? 'playground-bff/0.0.0' : 'okhttp/4.12.0' }),
          ...e.reqHeaders,
        },
        ...(e.reqBody !== undefined ? { body: e.reqBody } : {}),
        ...(e.reqContentType ? { contentType: e.reqContentType } : {}),
      },
      ...(e.outOfBand
        ? {}
        : {
            response: {
              headers: {
                'content-type': e.resContentType ?? 'application/json',
                date: new Date().toUTCString(),
              },
              ...(e.resBody !== undefined ? { body: e.resBody } : {}),
              contentType: e.resContentType ?? 'application/json',
            },
          }),
      correlationKeys: e.correlationKeys ?? [],
      outOfBand: e.outOfBand ?? false,
      ...(e.artifactKinds ? { artifactKinds: e.artifactKinds } : {}),
    };
    this.record.exchanges.push(ex);
    const { request, response, decoded: _decoded, ...summary } = ex;
    this.publish({
      type: 'run.exchange',
      runId: this.run.id,
      exchange: { ...summary, requestBytes: byteLength(request.body), responseBytes: byteLength(response?.body) },
    });
    return id;
  }

  artifact(kind: ArtifactKind, raw: string, sourceExchangeId: string, format?: CredentialFormat) {
    const artifact = { id: crypto.randomUUID(), kind, raw, sourceExchangeId, ...(format ? { format } : {}) };
    this.run.artifacts.push(artifact);
    this.publish({ type: 'run.artifact', runId: this.run.id, artifact });
  }

  delivery(purpose: DeliveryPurpose, instruction: DeliveryInstruction) {
    this.run.delivery = { purpose, instruction };
    this.publish({ type: 'run.delivery', runId: this.run.id, purpose, instruction });
  }

  /** Resolves true on manual confirmation, false on timeout. */
  waitManual(step: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.record.manualWaiters.delete(step);
        resolve(false);
      }, timeoutMs / this.speed);
      const poll = setInterval(() => {
        if (this.record.cancelled) {
          clearTimeout(timer);
          clearInterval(poll);
          reject(new Cancelled());
        }
      }, 200);
      this.record.manualWaiters.set(step, () => {
        clearTimeout(timer);
        clearInterval(poll);
        this.record.manualWaiters.delete(step);
        resolve(true);
      });
    });
  }

  json = (v: unknown) => JSON.stringify(v, null, 2);

  qr(payload: string, hint: string): DeliveryInstruction {
    const bytes = byteLength(payload);
    return {
      kind: 'qr',
      payload,
      bytes,
      qrVersion: qrVersionFor(bytes),
      hint,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async play(): Promise<void> {
    const { fx, run } = this;
    const format = run.config.format;
    const isWeb = this.wallet.id === 'inji-web';
    const from = this.walletName;

    // ---------- preflight ----------
    this.status('Preflight');
    await this.sleep(400);

    // ---------- issuing ----------
    this.status('Issuing');
    this.step('offer_prepared', 'active');
    await this.sleep(300);
    const createId = this.exchange({
      component: 'certify',
      from: 'bff',
      method: 'POST',
      url: `${ISSUER_URL}/v1/certify/pre-authorized-data`,
      status: 201,
      step: ProtocolStep.VCI_CREDENTIAL_OFFER,
      reqContentType: 'application/json',
      reqBody: this.json({
        credential_configuration_id: run.config.credentialConfigurationId,
        claims: { farmerID: 'FRM-2026-004217' },
      }),
      resBody: this.json({ credential_offer_uri: decodeURIComponent(fx.offerUri.split('=')[1] ?? '') }),
      correlationKeys: [fx.offerId],
    });
    const offerId = this.exchange({
      component: 'certify',
      from: 'bff',
      method: 'OOB',
      url: fx.offerUri,
      step: ProtocolStep.VCI_CREDENTIAL_OFFER,
      reqBody: fx.offerUri,
      outOfBand: true,
      correlationKeys: [fx.offerId],
      artifactKinds: ['offer'],
    });
    this.artifact('offer', fx.offerUri, offerId);
    this.step('offer_prepared', 'done', { evidenceKind: 'adapter', exchangeId: createId });

    this.step('offer_delivered', 'active');
    if (isWeb) {
      this.delivery('issuance', {
        kind: 'open-url',
        url: 'https://injiweb.playground.local/issuers',
        hint: 'Open Inji Web, choose “Inji Certify (playground)” and download the Farmer credential. The playground binds the first matching flow to this run.',
      });
    } else if (this.human) {
      this.delivery('issuance', this.qr(fx.offerUri, 'Open Inji Wallet, tap “+” → “Scan QR code” and scan this credential offer.'));
    } else {
      this.delivery('issuance', { kind: 'automated' });
    }
    await this.sleep(this.human ? 3500 : 600);

    const offerFetchId = this.exchange({
      component: 'certify',
      from,
      method: 'GET',
      url: `${ISSUER_URL}/v1/certify/credential-offer-data/${fx.offerId}`,
      status: 200,
      step: ProtocolStep.VCI_CREDENTIAL_OFFER,
      resBody: this.json(fx.offer),
      correlationKeys: [fx.offerId, fx.preAuthorizedCode],
      artifactKinds: ['offer'],
    });
    this.step('offer_delivered', 'done', { evidenceKind: 'tap', exchangeId: offerFetchId });
    await this.sleep(250);
    this.exchange({
      component: 'certify',
      from,
      method: 'GET',
      url: `${ISSUER_URL}/.well-known/openid-credential-issuer`,
      status: 200,
      step: ProtocolStep.VCI_ISSUER_METADATA,
      resBody: this.json(fx.issuerMetadata),
    });
    await this.sleep(250);
    this.exchange({
      component: 'certify',
      from,
      method: 'GET',
      url: `${ISSUER_URL}/.well-known/oauth-authorization-server`,
      status: 200,
      step: ProtocolStep.VCI_AS_METADATA,
      resBody: this.json({
        issuer: ISSUER_URL,
        token_endpoint: `${ISSUER_URL}/v1/certify/oauth/token`,
        'pre-authorized_grant_anonymous_access_supported': true,
        grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      }),
    });

    this.step(ProtocolStep.VCI_TOKEN, 'active');
    await this.sleep(500);
    if (this.scenario === 'fail-at-token') {
      const body = this.json({
        error: 'invalid_grant',
        error_description: 'Pre-authorized code is expired or has already been used',
      });
      const id = this.exchange({
        component: 'certify',
        from,
        method: 'POST',
        url: `${ISSUER_URL}/v1/certify/oauth/token`,
        status: 400,
        step: ProtocolStep.VCI_TOKEN,
        reqContentType: 'application/x-www-form-urlencoded',
        reqBody: fx.tokenRequest,
        resBody: body,
        correlationKeys: [fx.preAuthorizedCode],
      });
      this.step(ProtocolStep.VCI_TOKEN, 'failed', {
        evidenceKind: 'tap',
        exchangeId: id,
        error: { message: 'Token request rejected: invalid_grant', status: 400, body },
      });
      this.run.errorSummary = 'Token exchange failed: invalid_grant';
      return this.finish();
    }
    const tokenId = this.exchange({
      component: 'certify',
      from,
      method: 'POST',
      url: `${ISSUER_URL}/v1/certify/oauth/token`,
      status: 200,
      step: ProtocolStep.VCI_TOKEN,
      reqContentType: 'application/x-www-form-urlencoded',
      reqBody: fx.tokenRequest,
      resBody: this.json(fx.tokenResponse),
      correlationKeys: [fx.preAuthorizedCode, fx.cNonce],
    });
    this.step(ProtocolStep.VCI_TOKEN, 'done', { evidenceKind: 'tap', exchangeId: tokenId });

    this.step(ProtocolStep.VCI_CREDENTIAL, 'active');
    await this.sleep(700);
    const credId = this.exchange({
      component: 'certify',
      from,
      method: 'POST',
      url: `${ISSUER_URL}/v1/certify/issuance/credential`,
      status: 200,
      step: ProtocolStep.VCI_CREDENTIAL,
      reqContentType: 'application/json',
      reqHeaders: { authorization: `Bearer ${fx.accessToken}` },
      reqBody: this.json(fx.credentialRequest),
      resBody: this.json(fx.credentialResponse),
      correlationKeys: [fx.cNonce],
      artifactKinds: ['credential'],
    });
    this.artifact('credential', fx.credentialRaw, credId, format);
    this.step(ProtocolStep.VCI_CREDENTIAL, 'done', { evidenceKind: 'tap', exchangeId: credId });

    // ---------- holding ----------
    this.status('Holding');
    this.step('credential_held', 'active');
    if (this.human) {
      const confirmed = await this.waitManual('credential_held', 120_000);
      if (!confirmed) {
        this.step('credential_held', 'inconclusive', {
          error: { message: 'No confirmation that the credential reached the wallet within 2 minutes' },
        });
        return this.finish();
      }
      this.step('credential_held', 'done', { evidenceKind: 'manual' });
    } else {
      await this.sleep(400);
      this.step('credential_held', 'done', { evidenceKind: 'adapter' });
    }
    this.run.delivery = undefined;

    // ---------- presenting ----------
    this.status('Presenting');
    this.step('request_created', 'active');
    await this.sleep(400);
    const vpReqId = this.exchange({
      component: 'verify',
      from: 'bff',
      method: 'POST',
      url: `${VERIFIER_URL}/v1/verify/vp-request`,
      status: 201,
      step: ProtocolStep.VERIFY_CREATE_REQUEST,
      reqContentType: 'application/json',
      reqBody: this.json(fx.createVpRequestBody),
      resBody: this.json(fx.createVpRequestResponse),
      correlationKeys: [fx.requestId, fx.transactionId],
      artifactKinds: ['presentation_definition'],
    });
    const authReqId = this.exchange({
      component: 'verify',
      from: 'bff',
      method: 'OOB',
      url: fx.authorizationRequestUri,
      step: ProtocolStep.VP_AUTH_REQUEST,
      reqBody: fx.authorizationRequestUri,
      outOfBand: true,
      correlationKeys: [fx.requestId],
      artifactKinds: ['auth_request'],
    });
    this.artifact('auth_request', fx.authorizationRequestUri, authReqId);
    this.step('request_created', 'done', { evidenceKind: 'adapter', exchangeId: vpReqId });

    this.step('request_delivered', 'active');
    if (this.human) {
      this.delivery(
        'presentation',
        run.config.presentationFlow === 'same-device-deeplink'
          ? { kind: 'deeplink', url: fx.authorizationRequestUri, hint: 'On the phone that holds the credential, tap the link to open the wallet.' }
          : this.qr(fx.authorizationRequestUri, 'In the wallet, tap “Share” → “Scan QR code”, scan this request and approve sharing.'),
      );
    } else {
      this.delivery('presentation', { kind: 'automated' });
    }

    for (let i = 0; i < (this.human ? 2 : 1); i++) {
      await this.sleep(1200);
      this.statusPoll('ACTIVE');
    }

    if (this.scenario === 'timeout') {
      await this.sleep(4000);
      this.step('request_delivered', 'inconclusive', {
        error: { message: 'The wallet did not fetch the presentation request before it expired' },
      });
      this.statusPoll('EXPIRED');
      return this.finish();
    }

    const fetchId = this.exchange({
      component: 'verify',
      from,
      method: 'GET',
      url: `${VERIFIER_URL}/v1/verify/vp-request/${fx.requestId}`,
      status: 200,
      step: ProtocolStep.VP_REQUEST_OBJECT,
      resBody: this.json(fx.requestObject),
      correlationKeys: [fx.requestId],
      artifactKinds: ['auth_request', 'presentation_definition'],
    });
    this.artifact('presentation_definition', this.json(fx.presentationDefinition), fetchId);
    this.step('request_delivered', 'done', { evidenceKind: 'tap', exchangeId: fetchId });
    this.step(ProtocolStep.VP_REQUEST_OBJECT, 'done', { evidenceKind: 'tap', exchangeId: fetchId });

    this.step(ProtocolStep.VP_RESPONSE, 'active');
    await this.sleep(this.human ? 2500 : 700);
    const respId = this.exchange({
      component: 'verify',
      from,
      method: 'POST',
      url: `${VERIFIER_URL}/v1/verify/vp-submission/direct-post`,
      status: 200,
      step: ProtocolStep.VP_RESPONSE,
      reqContentType: 'application/x-www-form-urlencoded',
      reqBody: fx.vpSubmissionBody,
      resBody: '{}',
      correlationKeys: [fx.requestId],
      artifactKinds: ['vp_token', 'presentation_submission'],
    });
    this.artifact('vp_token', fx.vpToken, respId, format);
    this.artifact('presentation_submission', this.json(fx.presentationSubmission), respId);
    this.step(ProtocolStep.VP_RESPONSE, 'done', { evidenceKind: 'tap', exchangeId: respId });
    this.run.delivery = undefined;

    // ---------- verifying ----------
    this.status('Verifying');
    this.step(ProtocolStep.VERIFY_RESULT, 'active');
    await this.sleep(500);
    this.statusPoll('VP_SUBMITTED');
    await this.sleep(400);
    const resultBody = this.json(fx.vpResult);
    const resultId = this.exchange({
      component: 'verify',
      from: 'bff',
      method: 'GET',
      url: `${VERIFIER_URL}/v1/verify/vp-result/${fx.transactionId}`,
      status: 200,
      step: ProtocolStep.VERIFY_RESULT,
      resBody: resultBody,
      correlationKeys: [fx.transactionId],
      artifactKinds: ['verification_result'],
    });
    this.artifact('verification_result', resultBody, resultId);
    const vcStatus = (fx.vpResult as { vcResults: Array<{ verificationStatus: string }> }).vcResults[0]!
      .verificationStatus;
    const outcome = OUTCOME_FROM_INJI[vcStatus] ?? 'ERROR';
    this.run.observedOutcome = outcome;
    this.run.result = {
      outcome,
      perCredential: [{ index: 0, outcome }],
      verifierRaw: fx.vpResult,
    };
    this.publish({ type: 'run.result', runId: run.id, outcome, verifierRaw: fx.vpResult });
    this.step(ProtocolStep.VERIFY_RESULT, 'done', { evidenceKind: 'adapter', exchangeId: resultId });
    return this.finish();
  }

  private statusPoll(status: string) {
    this.exchange({
      component: 'verify',
      from: 'bff',
      method: 'GET',
      url: `${VERIFIER_URL}/v1/verify/vp-request/${this.fx.requestId}/status`,
      status: 200,
      step: ProtocolStep.VERIFY_STATUS,
      resBody: this.json({ status }),
      correlationKeys: [this.fx.requestId],
    });
  }

  /** Evaluating → Reported, applying the plan §6 verdict rule (without compliance checks yet). */
  private async finish() {
    this.status('Evaluating');
    for (const s of this.run.steps) {
      if (s.status === 'pending' || s.status === 'active') this.step(s.step, 'skipped');
    }
    await this.sleep(400);
    const steps = this.run.steps;
    const inconclusive = steps.some((s) => s.status === 'inconclusive');
    const failed = steps.some((s) => s.status === 'failed');
    const verdict: InteropVerdict = inconclusive
      ? 'INCONCLUSIVE'
      : !failed && this.run.observedOutcome === this.run.config.expectedOutcome
        ? 'PASS'
        : 'FAIL';
    this.run.verdict = verdict;
    if (!this.run.errorSummary && verdict !== 'PASS') {
      const bad = steps.find((s) => s.error);
      this.run.errorSummary = bad?.error?.message ??
        (this.run.observedOutcome
          ? `Expected ${this.run.config.expectedOutcome}, verifier returned ${this.run.observedOutcome}`
          : undefined);
    }
    this.run.delivery = undefined;
    this.status('Reported');
    this.publish({
      type: 'run.completed',
      runId: this.run.id,
      verdict,
      reportUrl: `/api/runs/${this.run.id}/report?format=md`,
    });
  }

  cancel() {
    for (const s of this.run.steps) {
      if (s.status === 'pending' || s.status === 'active') this.step(s.step, 'skipped');
    }
    this.run.delivery = undefined;
    this.run.errorSummary = 'Cancelled by user';
    this.status('Cancelled');
  }
}

export async function startSimulation(record: MockRunRecord, wallet: CatalogEntry): Promise<void> {
  const { config } = record.run;
  const scenario = scenarioFor(config.expectedOutcome, config.labels?.scenario);
  const fx = await buildFixtures({
    runId: record.run.id,
    format: config.format,
    credentialConfigurationId: config.credentialConfigurationId,
    scenario,
  });
  const sim = new RunSimulation(record, wallet, fx, scenario);
  try {
    await sim.play();
  } catch (e) {
    if (e instanceof Cancelled) sim.cancel();
    else {
      console.error('Simulation crashed', e);
      sim.status('Aborted');
    }
  }
}

export function confirmManualEvidence(runId: string, step: string): boolean {
  const waiter = db.get(runId)?.manualWaiters.get(step);
  waiter?.();
  return Boolean(waiter);
}
