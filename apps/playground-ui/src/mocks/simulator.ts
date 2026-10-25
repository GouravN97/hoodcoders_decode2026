// Plays a run as the BFF would: each step writes to the mock db and publishes the same
// RunEventMap events the real RunEventsGateway sends. Human-in-the-loop wallets wait for the
// "I can see the credential" confirmation, exactly like the real ManualEvidenceService.
import {
  credentialFromVpToken,
  formatLabel,
  ProtocolStep,
  runUsesPhase,
  secondOpinionComparable,
  secondOpinionFinding,
  tamperDiffText,
  type ArtifactKind,
  type CatalogEntry,
  type CheckFinding,
  type CredentialFormat,
  type DeliveryInstruction,
  type DeliveryPurpose,
  type EvidenceKind,
  type ExchangeWithDecoded,
  type InteropVerdict,
  type MockVerifierResult,
  type RunEvent,
  type RunPhase,
  type RunState,
  type RunStep,
  type SecondOpinion,
  type StepError,
  type StepStatus,
  type VerificationOutcome,
  type VerificationStage,
} from '@playground/shared';
import { parseDeviceResponse, pemToDer, TEST_MDOC_ISSUER_CERT_PEM, verifyMdoc } from '@playground/protocol-core';
import { simulatedEvents } from '../realtime';
import { mockCatalog } from './catalog';
import { db, type MockRunRecord } from './db';
import {
  buildFixtures,
  simulatedMockVerifierResult,
  verifierEndpoints,
  type RunFixtures,
  type Scenario,
} from './fixtures';

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
    tampered?: ExchangeWithDecoded['tampered'];
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
      ...(e.tampered ? { tampered: e.tampered } : {}),
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

  finding(f: Omit<CheckFinding, 'id'>) {
    const finding: CheckFinding = { id: crypto.randomUUID(), ...f };
    this.record.findings.push(finding);
    this.publish({ type: 'run.check', runId: this.run.id, finding });
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

  private uses(phase: RunPhase) {
    return runUsesPhase(this.run.config.mode, phase);
  }

  /** Same phase split as the BFF orchestrator; each phase returns false when it ended the run. */
  async play(): Promise<void> {
    this.status('Preflight');
    await this.sleep(400);
    if (this.uses('issuing') && this.externalIssuer) {
      // Like the BFF: the wallet talks to the external issuer directly, outside the tap.
      if (!(await this.issueExternal())) return;
    } else {
      if (this.uses('issuing') && !(await this.issue())) return;
      if (!(await this.hold())) return;
    }
    if (this.uses('presenting') && !(await this.presentAndVerify())) return;
    return this.finish();
  }

  private get externalIssuer() {
    return mockCatalog.find((c) => c.id === this.run.config.issuerId)?.vendor === 'external';
  }

  /**
   * Hovi / Animo: the offer is the only message the playground sees. Token and credential are
   * inferred from the holder confirming that the credential is in the wallet, as the BFF does.
   */
  private async issueExternal(): Promise<boolean> {
    const { run } = this;
    const issuer = mockCatalog.find((c) => c.id === run.config.issuerId)!;
    this.status('Issuing');
    this.step('offer_prepared', 'active');
    await this.sleep(300);
    const offerUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
      `${issuer.publicUrl.replace(/\/$/, '')}/offers/${crypto.randomUUID()}`,
    )}`;
    const oob = this.exchange({
      component: issuer.id,
      from: 'bff',
      method: 'OOB',
      url: offerUri,
      step: ProtocolStep.VCI_CREDENTIAL_OFFER,
      reqBody: offerUri,
      outOfBand: true,
      artifactKinds: ['offer'],
    });
    this.artifact('offer', offerUri, oob);
    this.step('offer_prepared', 'done', { evidenceKind: 'adapter', exchangeId: oob });
    this.step('offer_delivered', 'active');
    this.delivery(
      'issuance',
      this.qr(offerUri, `Open the wallet and scan this ${issuer.displayName} credential offer.`),
    );
    this.step('offer_delivered', 'done', { evidenceKind: 'adapter' });

    this.status('Holding');
    this.step('credential_held', 'active');
    if (!(await this.waitManual('credential_held', 120_000))) {
      this.step('credential_held', 'inconclusive', {
        error: { message: 'No confirmation that the credential reached the wallet within 2 minutes' },
      });
      await this.finish();
      return false;
    }
    for (const step of [ProtocolStep.VCI_TOKEN, ProtocolStep.VCI_CREDENTIAL]) {
      this.step(step, 'active');
      this.step(step, 'done', { evidenceKind: 'manual' });
    }
    this.step('credential_held', 'done', { evidenceKind: 'manual' });
    this.finding({
      checkId: 'EXTERNAL-ISSUER-MANUAL-EVIDENCE',
      stage: 'issuance',
      severity: 'WARN',
      message:
        'The wallet contacted the external issuer directly. Token and credential completion are inferred from the holder confirming that the credential is visible in the wallet.',
      specRef: 'OpenID4VCI 1.0 — credential offer and pre-authorized code flow',
    });
    this.run.delivery = undefined;
    return true;
  }

  private async issue(): Promise<boolean> {
    const { fx, run } = this;
    const format = run.config.format;
    const isWeb = this.wallet.id === 'inji-web';
    const from = this.walletName;

    this.status('Issuing');
    this.step('offer_prepared', 'active');
    await this.sleep(300);
    const createId = this.exchange({
      component: fx.issuerComponent,
      from: 'bff',
      method: 'POST',
      url: `${fx.issuerUrl}/v1/certify/pre-authorized-data`,
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
      component: fx.issuerComponent,
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
      component: fx.issuerComponent,
      from,
      method: 'GET',
      url: `${fx.issuerUrl}/v1/certify/credential-offer-data/${fx.offerId}`,
      status: 200,
      step: ProtocolStep.VCI_CREDENTIAL_OFFER,
      resBody: this.json(fx.offer),
      correlationKeys: [fx.offerId, fx.preAuthorizedCode],
      artifactKinds: ['offer'],
    });
    this.step('offer_delivered', 'done', { evidenceKind: 'tap', exchangeId: offerFetchId });
    await this.sleep(250);
    this.exchange({
      component: fx.issuerComponent,
      from,
      method: 'GET',
      url: `${fx.issuerUrl}/.well-known/openid-credential-issuer`,
      status: 200,
      step: ProtocolStep.VCI_ISSUER_METADATA,
      resBody: this.json(fx.issuerMetadata),
    });
    await this.sleep(250);
    this.exchange({
      component: fx.issuerComponent,
      from,
      method: 'GET',
      url: `${fx.issuerUrl}/.well-known/oauth-authorization-server`,
      status: 200,
      step: ProtocolStep.VCI_AS_METADATA,
      resBody: this.json({
        issuer: fx.issuerUrl,
        token_endpoint: `${fx.issuerUrl}/v1/certify/oauth/token`,
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
        component: fx.issuerComponent,
        from,
        method: 'POST',
        url: `${fx.issuerUrl}/v1/certify/oauth/token`,
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
      await this.finish();
      return false;
    }
    const tokenId = this.exchange({
      component: fx.issuerComponent,
      from,
      method: 'POST',
      url: `${fx.issuerUrl}/v1/certify/oauth/token`,
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
      component: fx.issuerComponent,
      from,
      method: 'POST',
      url: `${fx.issuerUrl}/v1/certify/issuance/credential`,
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
    return true;
  }

  /**
   * After issuing: the wallet stores the credential. present-only: the mock wallet looks up one it
   * stored in an earlier mock run; a phone or Inji Web needs the person to confirm it is there.
   */
  private async hold(): Promise<boolean> {
    const { fx, run } = this;
    const config = run.config;
    this.status('Holding');
    this.step('credential_held', 'active');
    if (this.human) {
      const confirmed = await this.waitManual('credential_held', 120_000);
      if (!confirmed) {
        this.step('credential_held', 'inconclusive', {
          error: { message: 'No confirmation that the credential reached the wallet within 2 minutes' },
        });
        await this.finish();
        return false;
      }
      this.step('credential_held', 'done', { evidenceKind: 'manual' });
    } else if (this.uses('issuing')) {
      await this.sleep(400);
      db.heldCredentials.push({
        id: crypto.randomUUID(),
        format: config.format,
        credentialConfigurationId: config.credentialConfigurationId,
        issuer: fx.issuerUrl,
        raw: fx.credentialRaw,
        receivedAt: new Date().toISOString(),
        holderDid: 'did:jwk:mock-holder',
      });
      this.step('credential_held', 'done', { evidenceKind: 'adapter' });
    } else {
      await this.sleep(300);
      const held = db.heldCredentials
        .filter((c) =>
          config.heldCredentialId
            ? c.id === config.heldCredentialId && c.format === config.format
            : c.format === config.format && c.credentialConfigurationId === config.credentialConfigurationId,
        )
        .at(-1);
      if (!held) {
        this.step('credential_held', 'failed', {
          error: {
            message: `Mock wallet holds no ${formatLabel(config.format)} ${config.credentialConfigurationId} credential. Run an issue-only or full run first.`,
          },
        });
        await this.finish();
        return false;
      }
      this.run.artifacts.push({ id: crypto.randomUUID(), kind: 'credential', raw: held.raw, format: held.format });
      this.publish({ type: 'run.artifact', runId: run.id, artifact: this.run.artifacts.at(-1)! });
      this.step('credential_held', 'done', { evidenceKind: 'adapter' });
    }
    this.run.delivery = undefined;
    return true;
  }

  private async presentAndVerify(): Promise<boolean> {
    const { fx, run } = this;
    const format = run.config.format;
    const from = this.walletName;

    this.status('Presenting');
    this.step('request_created', 'active');
    await this.sleep(400);
    const vpReqId = this.exchange({
      component: fx.verifier.component,
      from: 'bff',
      method: 'POST',
      url: fx.verifier.create,
      status: 201,
      step: ProtocolStep.VERIFY_CREATE_REQUEST,
      reqContentType: 'application/json',
      reqBody: this.json(fx.createVpRequestBody),
      resBody: this.json(fx.createVpRequestResponse),
      correlationKeys: [fx.requestId, fx.transactionId],
      artifactKinds: ['presentation_definition'],
    });
    const authReqId = this.exchange({
      component: fx.verifier.component,
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
      await this.finish();
      return false;
    }

    const fetchId = this.exchange({
      component: fx.verifier.component,
      from,
      method: 'GET',
      url: fx.verifier.requestObject(fx.requestId),
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
    const evidence = fx.tamperEvidence;
    const applied = this.run.tamper;
    const respId = this.exchange({
      component: fx.verifier.component,
      from,
      method: 'POST',
      url: fx.verifier.response(fx.requestId),
      status: 200,
      step: ProtocolStep.VP_RESPONSE,
      reqContentType: 'application/x-www-form-urlencoded',
      reqBody: fx.vpSubmissionBody,
      resBody: '{}',
      correlationKeys: [fx.requestId],
      artifactKinds: ['vp_token', 'presentation_submission'],
      ...(evidence && applied
        ? {
            tampered: {
              ruleId: applied.id,
              diff: tamperDiffText(evidence),
              target: evidence.target,
              ...(evidence.before ? { before: evidence.before } : {}),
              ...(evidence.after ? { after: evidence.after } : {}),
            },
          }
        : {}),
    });
    this.artifact('vp_token', fx.vpToken, respId, format);
    if (evidence && applied) {
      if (evidence.after) {
        this.artifact(
          evidence.target === 'credential' ? 'tampered_credential' : 'tampered_vp',
          evidence.after,
          respId,
          format,
        );
      }
      this.run.tamper = { ...applied, summary: evidence.summary, exchangeId: respId };
    }
    this.artifact('presentation_submission', this.json(fx.presentationSubmission), respId);
    this.step(ProtocolStep.VP_RESPONSE, 'done', { evidenceKind: 'tap', exchangeId: respId });
    this.run.delivery = undefined;

    // ---------- verifying ----------
    this.status('Verifying');
    this.step(ProtocolStep.VERIFY_RESULT, 'active');
    await this.sleep(500);
    this.statusPoll('VP_SUBMITTED');
    await this.sleep(400);
    const mock = fx.verifier.component === 'mock-verifier';
    const mockResult: MockVerifierResult | undefined = mock
      ? {
          transactionId: fx.transactionId,
          ...(format === 'mso_mdoc' ? await this.mockVerifierMdoc() : simulatedMockVerifierResult(fx.problem, format, false)),
          format,
          credentialType: run.config.credentialConfigurationId,
          issuer: fx.issuerUrl,
          verifiedAt: new Date().toISOString(),
        }
      : undefined;
    const verifierRaw =
      mockResult ??
      (format === 'mso_mdoc'
        ? { simulated: true, note: 'Inji Verify 0.18.2 does not verify mso_mdoc; no answer is simulated for it' }
        : fx.vpResult);
    const resultBody = this.json(verifierRaw);
    const resultId = this.exchange({
      component: fx.verifier.component,
      from: 'bff',
      method: 'GET',
      url: fx.verifier.result(fx.transactionId),
      status: 200,
      step: ProtocolStep.VERIFY_RESULT,
      resBody: resultBody,
      correlationKeys: [fx.transactionId],
      artifactKinds: ['verification_result'],
    });
    this.artifact('verification_result', resultBody, resultId);
    const vcStatus = (fx.vpResult as { vcResults: Array<{ verificationStatus: string }> }).vcResults[0]!
      .verificationStatus;
    // Inji Verify 0.18.2 has no mso_mdoc support; the simulator does not invent an answer for it.
    const unsupported = !mock && format === 'mso_mdoc';
    const outcome = mockResult?.outcome ?? (unsupported ? 'ERROR' : (OUTCOME_FROM_INJI[vcStatus] ?? 'ERROR'));
    const stages = mockResult?.stages;
    this.run.observedOutcome = outcome;
    const secondOpinion = await this.secondOpinion(outcome, stages);
    this.run.result = {
      outcome,
      perCredential: [{ index: 0, outcome }],
      verifierRaw,
      ...(stages ? { stages } : {}),
      ...(secondOpinion ? { secondOpinion } : {}),
    };
    this.publish({
      type: 'run.result',
      runId: run.id,
      outcome,
      verifierRaw,
      ...(stages ? { stages } : {}),
      ...(secondOpinion ? { secondOpinion } : {}),
    });
    this.step(ProtocolStep.VERIFY_RESULT, 'done', { evidenceKind: 'adapter', exchangeId: resultId });
    return true;
  }

  /** The mock verifier's mDoc checks, run for real on the simulated DeviceResponse. */
  private async mockVerifierMdoc(): Promise<Pick<MockVerifierResult, 'outcome' | 'stages'>> {
    const { fx } = this;
    const doc = parseDeviceResponse(fx.vpToken).documents[0]!;
    const descriptor = (fx.presentationDefinition as { input_descriptors: Array<{ id: string }> }).input_descriptors[0]!;
    const stages: VerificationStage[] = [
      { id: 'response-shape', label: 'Response shape', status: 'pass', message: 'vp_token and presentation_submission present' },
      { id: 'state', label: 'State', status: 'pass', message: 'state matches the request' },
      { id: 'submission', label: 'Presentation submission', status: 'pass', message: `Maps to input descriptor ${descriptor.id} as mso_mdoc` },
      doc.docType === descriptor.id
        ? { id: 'requested-credential', label: 'Requested credential', status: 'pass', message: `${doc.docType} with the requested elements, for input descriptor ${descriptor.id}` }
        : { id: 'requested-credential', label: 'Requested credential', status: 'fail', message: `docType ${doc.docType}, the request asked for ${descriptor.id}` },
      ...(await verifyMdoc(doc, {
        handover: { clientId: fx.verifier.clientId, responseUri: fx.verifier.response(fx.requestId), nonce: fx.nonce },
        trustedCertificates: pemToDer(TEST_MDOC_ISSUER_CERT_PEM),
      })),
    ];
    const failed = (ids: string[]) => stages.some((st) => st.status === 'fail' && ids.includes(st.id));
    const outcome: VerificationOutcome = failed(['requested-credential', 'format', 'issuer-signature', 'digests', 'holder-binding'])
      ? 'INVALID'
      : failed(['validity'])
        ? 'EXPIRED'
        : 'VALID';
    return { outcome, stages };
  }

  /** VER-002, as the BFF does it: the other verifier checks the presented credential on its own. */
  private async secondOpinion(outcome: VerificationOutcome, stages: VerificationStage[] | undefined): Promise<SecondOpinion | undefined> {
    const { fx, run } = this;
    const other = mockCatalog.find(
      (c) => c.role === 'verifier' && c.id !== run.config.verifierId && c.health === 'up' && c.capabilities.formats.includes(run.config.format),
    );
    const credential = credentialFromVpToken(fx.vpToken);
    if (!other || !credential || outcome === 'ERROR') return undefined;
    await this.sleep(300);
    const endpoints = verifierEndpoints(other.id);
    const mock = other.id === 'mock-verifier';
    const answer = simulatedMockVerifierResult(fx.problem, run.config.format, true);
    const body = mock
      ? { ...answer, format: run.config.format, issuer: fx.issuerUrl, verifiedAt: new Date().toISOString() }
      : { verificationStatus: { VALID: 'SUCCESS', INVALID: 'INVALID', EXPIRED: 'EXPIRED' }[answer.outcome as string] ?? 'INVALID' };
    const exchangeId = this.exchange({
      component: endpoints.component,
      from: 'bff',
      method: 'POST',
      url: endpoints.verifyCredential,
      status: 200,
      step: ProtocolStep.VC_DIRECT_VERIFY,
      reqContentType: mock ? 'application/json' : run.config.format === 'ldp_vc' ? 'application/json' : `application/${run.config.format}`,
      reqBody: mock ? this.json({ credential, format: run.config.format }) : credential,
      resBody: this.json(body),
    });
    const failed = mock ? answer.stages.find((s) => s.status === 'fail') : undefined;
    const opinion: SecondOpinion = {
      verifierId: other.id,
      displayName: other.displayName,
      outcome: answer.outcome,
      ...(mock ? { stages: answer.stages } : {}),
      ...(failed ? { reason: `${failed.label}: ${failed.message}` } : {}),
      comparable: secondOpinionComparable({ outcome, ...(stages ? { stages } : {}) }, run.tamper?.id),
      agrees: answer.outcome === outcome,
      exchangeId,
    };
    const primaryName = mockCatalog.find((c) => c.id === run.config.verifierId)?.displayName ?? run.config.verifierId;
    this.finding({
      checkId: 'VER-002',
      stage: 'verification',
      ...secondOpinionFinding(opinion, { name: primaryName, outcome }),
      specRef: 'Playground differential verification (plan §12)',
      exchangeId,
    });
    return opinion;
  }

  private statusPoll(status: string) {
    this.exchange({
      component: this.fx.verifier.component,
      from: 'bff',
      method: 'GET',
      url: this.fx.verifier.status(this.fx.requestId),
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
    const observed = this.run.observedOutcome;
    // Same rule as the BFF: a tamper run passes when the verifier refuses the tampered presentation.
    const tamper = this.run.tamper;
    const tamperCaught = Boolean(tamper && observed && observed !== 'VALID');
    if (tamper && observed && this.uses('verifying')) {
      this.finding({
        checkId: 'TAMPER-001',
        stage: 'verification',
        severity: !tamperCaught ? 'FAIL' : observed === tamper.expectedOutcome ? 'PASS' : 'WARN',
        message: !tamperCaught
          ? `The verifier accepted a presentation the playground had tampered with (${tamper.id})`
          : `The verifier rejected the ${tamper.id} presentation${observed === tamper.expectedOutcome ? ' as expected' : ` as ${observed}`}`,
        specRef: 'Playground tamper catalogue (plan §13)',
        ...(tamper.exchangeId ? { exchangeId: tamper.exchangeId } : {}),
      });
    }
    // Issue-only runs pass once the credential is stored; the others on the verifier's answer.
    const matched = this.uses('verifying')
      ? observed === this.run.config.expectedOutcome || tamperCaught
      : steps.every((s) => s.status === 'done');
    const warned = this.record.findings.some((f) => f.severity === 'WARN');
    const verdict: InteropVerdict = inconclusive
      ? 'INCONCLUSIVE'
      : !failed && matched
        ? warned
          ? 'PASS_WITH_WARNINGS'
          : 'PASS'
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
  const plan = record.tamperPlan;
  const fx = await buildFixtures({
    runId: record.run.id,
    format: config.format,
    credentialConfigurationId: config.credentialConfigurationId,
    scenario,
    verifierId: config.verifierId,
    ...(plan?.def.mechanism === 'wallet-hook' ? { tamper: plan.def.id } : {}),
    ...(plan?.replay ? { replay: plan.replay } : {}),
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
