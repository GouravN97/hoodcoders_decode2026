// RunOrchestrator (plan §4.5, §8.2): evidence-driven runs. Each step completes on evidence from
// one of three sources: `tap` (a correlated exchange captured by the Protocol Tap), `adapter`
// (an adapter's return value, e.g. the mock wallet storing the credential) or `manual` (the user
// confirming on the run screen). A phone wallet and the headless mock wallet go through the same
// steps; only where the evidence comes from differs.
//
// An error response on the step being waited for fails it at once with the upstream body. A step
// that sees no evidence in time is `inconclusive` for human-in-the-loop wallets and `failed` for
// headless ones.
import { randomUUID } from 'node:crypto';
import {
  ProtocolStep,
  RUN_STEP_TEMPLATE,
  stepLabel,
  type Artifact,
  type ArtifactKind,
  type CatalogEntry,
  type CheckFinding,
  type CredentialFormat,
  type DeliveryInstruction,
  type DeliveryPurpose,
  type EvidenceKind,
  type Exchange,
  type HeldCredential,
  type InteropVerdict,
  type MockWalletTamper,
  type RunConfig,
  type RunDetail,
  type RunState,
  type RunStep,
  type StepError,
  type StepStatus,
} from '@playground/shared';
import { AdapterError } from '../adapters/http.ts';
import type {
  IssuanceHandle,
  IssuerAdapter,
  PresentationRequestHandle,
  RunContext,
  VerifierAdapter,
  WalletAdapter,
} from '../adapters/types.ts';
import { predict } from '../catalog/compatibility.ts';
import type { ImplementationRegistry } from '../catalog/registry.ts';
import { decodeBody } from '../decoder/payload-decoder.ts';
import { arm, disarm, register } from '../tap/correlator.ts';
import {
  addExchange,
  exchangeEvents,
  getExchangesByRun,
  nextSeq,
} from '../store/exchange-store.ts';
import { publish, type RunRecord, type RunStore } from './store.ts';

export interface OrchestratorSettings {
  /** Per-step evidence timeout for headless wallets. */
  headlessTimeoutMs: number;
  /** Per-step evidence timeout for human-in-the-loop wallets. */
  humanTimeoutMs: number;
  /** How long a person has to confirm the credential is in the wallet. */
  manualTimeoutMs: number;
}

export class RunConfigError extends Error {}
class Cancelled extends Error {}

/** A step that failed or gave up; `status` is 'failed' or 'inconclusive'. */
class StepOutcome extends Error {
  constructor(
    readonly step: string,
    readonly status: 'failed' | 'inconclusive',
    readonly error: StepError,
  ) {
    super(error.message);
  }
}

const TEMPLATE_STEPS: string[] = RUN_STEP_TEMPLATE.map((t) => t.step);

/** Which run step a protocol step reported by an adapter belongs to. */
function templateStepFor(step: string): string | undefined {
  if (TEMPLATE_STEPS.includes(step)) return step;
  switch (step) {
    case ProtocolStep.VCI_CREDENTIAL_OFFER:
    case ProtocolStep.VCI_ISSUER_METADATA:
    case ProtocolStep.VCI_AS_METADATA:
      return 'offer_delivered';
    case ProtocolStep.VP_AUTH_REQUEST:
      return 'request_delivered';
    case 'oid4vp.match':
      return ProtocolStep.VP_RESPONSE;
    default:
      return undefined;
  }
}

export class RunOrchestrator {
  constructor(
    private readonly registry: ImplementationRegistry,
    private readonly store: RunStore,
    private readonly settings: OrchestratorSettings,
  ) {}

  /** Validates the config against the catalog, records the run and starts it in the background. */
  async create(config: RunConfig, trigger: RunDetail['trigger'] = 'ui'): Promise<RunDetail> {
    const issuer = this.registry.issuer(config.issuerId);
    const wallet = this.registry.wallet(config.walletId);
    const verifier = this.registry.verifier(config.verifierId);
    if (!issuer) throw new RunConfigError(`Unknown issuer ${config.issuerId}`);
    if (!wallet) throw new RunConfigError(`Unknown wallet ${config.walletId}`);
    if (!verifier) throw new RunConfigError(`Unknown verifier ${config.verifierId}`);

    const catalog = await this.registry.list(30_000);
    const run: RunDetail = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      trigger,
      config,
      state: 'Configured',
      prediction: predict(config, catalog),
      correlation: config.grantType === 'authorization_code' ? 'heuristic' : 'exact',
      steps: RUN_STEP_TEMPLATE.map((t) => ({
        phase: t.phase,
        step: t.step,
        status: 'pending' as const,
      })),
      versions: [config.issuerId, config.walletId, config.verifierId].map((id) => ({
        implementationId: id,
        version: catalog.find((c) => c.id === id)?.version ?? 'unknown',
      })),
      artifacts: [],
    };
    const record = this.store.create(run);
    const walletEntry = catalog.find((c) => c.id === config.walletId)!;
    const execution = new RunExecution(
      record,
      { issuer, wallet, verifier },
      walletEntry,
      this.settings,
      () => this.store.persist(record),
    );
    void execution.start();
    return run;
  }

  /** Marks a run heuristic when the armed-window strategy bound one of its exchanges. */
  markHeuristic(runId: string): void {
    const record = this.store.get(runId);
    if (record) record.run.correlation = 'heuristic';
  }

  confirmManual(runId: string, step: string): boolean {
    const waiter = this.store.get(runId)?.manualWaiters.get(step);
    waiter?.();
    return Boolean(waiter);
  }

  cancel(runId: string): boolean {
    const record = this.store.get(runId);
    if (!record) return false;
    record.controller.abort(new Cancelled('Cancelled by user'));
    return true;
  }
}

interface Adapters {
  issuer: IssuerAdapter;
  wallet: WalletAdapter;
  verifier: VerifierAdapter;
}

interface Evidence {
  kind: EvidenceKind;
  exchange?: Exchange;
}

class RunExecution {
  private readonly ctx: RunContext;
  private readonly headless: boolean;

  constructor(
    private readonly record: RunRecord,
    private readonly adapters: Adapters,
    private readonly walletEntry: CatalogEntry,
    private readonly settings: OrchestratorSettings,
    private readonly persist: () => void,
  ) {
    this.ctx = {
      runId: record.run.id,
      config: record.run.config,
      signal: record.controller.signal,
    };
    this.headless = walletEntry.capabilities.automation === 'headless';
  }

  private get run() {
    return this.record.run;
  }

  // ---------- events ----------

  private status(state: RunState) {
    const at = new Date().toISOString();
    this.run.state = state;
    if (state === 'Reported' || state === 'Aborted' || state === 'Cancelled')
      this.run.finishedAt = at;
    publish({ type: 'run.status', runId: this.run.id, state, at });
  }

  private step(
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
    publish({ type: 'run.step', runId: this.run.id, step: next });
  }

  private stepStatus = (step: string) => this.run.steps.find((s) => s.step === step)?.status;

  private delivery(purpose: DeliveryPurpose, instruction: DeliveryInstruction) {
    this.run.delivery = { purpose, instruction };
    publish({ type: 'run.delivery', runId: this.run.id, purpose, instruction });
  }

  private artifact(
    kind: ArtifactKind,
    raw: string,
    sourceExchangeId?: string,
    format?: CredentialFormat,
  ) {
    const artifact: Artifact = {
      id: randomUUID(),
      kind,
      raw,
      ...(sourceExchangeId ? { sourceExchangeId } : {}),
      ...(format ? { format } : {}),
    };
    this.run.artifacts = [...this.run.artifacts.filter((a) => a.kind !== kind), artifact];
    publish({ type: 'run.artifact', runId: this.run.id, artifact });
  }

  private finding(f: Omit<CheckFinding, 'id'>) {
    const finding: CheckFinding = { id: randomUUID(), ...f };
    this.record.findings.push(finding);
    publish({ type: 'run.check', runId: this.run.id, finding });
  }

  /** A QR code or link payload the BFF handed out, recorded as an out-of-band exchange (plan §6). */
  private outOfBand(
    component: string,
    step: ProtocolStep,
    uri: string,
    artifactKinds: ArtifactKind[],
    correlationKeys: string[] = [],
  ): string {
    const ex: Exchange = {
      id: randomUUID(),
      runId: this.run.id,
      seq: nextSeq(),
      ts: new Date().toISOString(),
      component,
      from: 'bff',
      method: 'OOB',
      url: uri,
      latencyMs: 0,
      step,
      request: { headers: {}, body: uri },
      correlationKeys,
      outOfBand: true,
      artifactKinds,
    };
    addExchange(ex);
    return ex.id;
  }

  // ---------- evidence ----------

  private timeout() {
    return this.headless ? this.settings.headlessTimeoutMs : this.settings.humanTimeoutMs;
  }

  /**
   * Resolves on the first run exchange matching `match` (already captured or still to come), or
   * when `alt` (an adapter call that proves the step) settles. A matching error response fails the
   * step; no evidence before the timeout gives up on it.
   */
  private waitFor(
    step: string,
    match: (ex: Exchange) => boolean,
    alt?: Promise<unknown>,
    timeoutMs = this.timeout(),
  ): Promise<Evidence> {
    return new Promise<Evidence>((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        exchangeEvents.off('run-exchange', onExchange);
        this.ctx.signal.removeEventListener('abort', onAbort);
        fn();
      };
      const consider = (ex: Exchange) => {
        if (ex.runId !== this.run.id || !match(ex)) return false;
        if (ex.status !== undefined && ex.status >= 400) {
          done(() =>
            reject(
              new StepOutcome(step, 'failed', {
                message: `${stepLabel(step)} failed: ${ex.method} ${ex.url} answered HTTP ${ex.status}`,
                status: ex.status,
                ...(ex.response?.body ? { body: ex.response.body } : {}),
              }),
            ),
          );
        } else done(() => resolve({ kind: 'tap', exchange: ex }));
        return true;
      };
      const onExchange = (ex: Exchange) => void consider(ex);
      const onAbort = () => done(() => reject(this.ctx.signal.reason ?? new Cancelled()));
      const timer = setTimeout(
        () =>
          done(() =>
            reject(
              new StepOutcome(step, this.headless ? 'failed' : 'inconclusive', {
                message: `No evidence of “${stepLabel(step)}” within ${Math.round(timeoutMs / 1000)} s`,
              }),
            ),
          ),
        timeoutMs,
      );
      exchangeEvents.on('run-exchange', onExchange);
      this.ctx.signal.addEventListener('abort', onAbort);
      for (const ex of getExchangesByRun(this.run.id)) if (consider(ex)) return;

      alt?.then(
        // The tap records an exchange as soon as it has answered, so give it a moment to arrive
        // before settling for the adapter's word.
        () => setTimeout(() => done(() => resolve({ kind: 'adapter' })), 250),
        (e: unknown) =>
          setTimeout(() => {
            if (settled) return;
            const failedAt = e instanceof AdapterError ? templateStepFor(e.step) : undefined;
            const prefix = failedAt && failedAt !== step ? `${stepLabel(failedAt)}: ` : '';
            done(() => reject(this.toStepOutcome(step, e, prefix)));
          }, 250),
      );
    });
  }

  private toStepOutcome(step: string, cause: unknown, prefix = ''): Error {
    let e = cause;
    if (e instanceof AggregateError)
      e =
        e.errors.find((x) => x instanceof StepOutcome || x instanceof AdapterError) ?? e.errors[0];
    if (e instanceof Cancelled || this.ctx.signal.aborted) return e as Error;
    // A failure reported for another step (e.g. the status poll) belongs to the step being waited on.
    if (e instanceof StepOutcome)
      return e.step === step ? e : new StepOutcome(step, e.status, e.error);
    if (e instanceof AdapterError) {
      return new StepOutcome(step, 'failed', {
        message: `${prefix}${e.message}`,
        ...(e.status !== undefined ? { status: e.status } : {}),
        ...(e.body ? { body: e.body } : {}),
      });
    }
    return new StepOutcome(step, 'failed', {
      message: `${prefix}${(e as Error).message ?? String(e)}`,
    });
  }

  private async attempt<T>(step: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw this.toStepOutcome(step, e);
    }
  }

  private waitManual(step: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        this.record.manualWaiters.delete(step);
        reject(this.ctx.signal.reason ?? new Cancelled());
      };
      const timer = setTimeout(() => {
        this.record.manualWaiters.delete(step);
        this.ctx.signal.removeEventListener('abort', onAbort);
        reject(
          new StepOutcome(step, 'inconclusive', {
            message: `No confirmation that the credential reached the wallet within ${Math.round(timeoutMs / 60_000)} min`,
          }),
        );
      }, timeoutMs);
      this.ctx.signal.addEventListener('abort', onAbort, { once: true });
      this.record.manualWaiters.set(step, () => {
        clearTimeout(timer);
        this.ctx.signal.removeEventListener('abort', onAbort);
        this.record.manualWaiters.delete(step);
        resolve();
      });
    });
  }

  private done(step: string, ev: Evidence) {
    this.step(step, 'done', {
      evidenceKind: ev.kind,
      ...(ev.exchange ? { exchangeId: ev.exchange.id } : {}),
    });
  }

  // ---------- run ----------

  async start(): Promise<void> {
    try {
      await this.play();
    } catch (e) {
      if (e instanceof Cancelled || this.ctx.signal.aborted) return this.cancel();
      if (e instanceof StepOutcome) {
        this.step(e.step, e.status, { error: e.error });
        this.run.errorSummary ??= e.error.message;
        return this.finish();
      }
      console.error(`[run ${this.run.id}] crashed`, e);
      this.run.errorSummary = `Orchestrator error: ${(e as Error).message}`;
      return this.finish();
    } finally {
      disarm(this.run.id);
    }
  }

  private async play(): Promise<void> {
    const { issuer, wallet, verifier } = this.adapters;
    const config = this.run.config;
    const preAuth = config.grantType === 'pre-authorized_code';

    // ---------- preflight ----------
    this.status('Preflight');
    const required: Array<[string, Promise<string>]> = [
      [issuer.descriptor.displayName, issuer.healthCheck()],
      [verifier.descriptor.displayName, verifier.healthCheck()],
      ...(this.headless
        ? [[wallet.descriptor.displayName, wallet.healthCheck()] as [string, Promise<string>]]
        : []),
    ];
    const down = [];
    for (const [name, health] of required) if ((await health) === 'down') down.push(name);
    if (down.length > 0) {
      this.run.errorSummary = `Not responding: ${down.join(', ')}`;
      for (const s of this.run.steps) this.step(s.step, 'skipped');
      this.run.verdict = 'INCONCLUSIVE';
      this.status('Aborted');
      publish({
        type: 'run.completed',
        runId: this.run.id,
        verdict: 'INCONCLUSIVE',
        reportUrl: this.reportUrl(),
      });
      this.persist();
      return;
    }

    // ---------- issuing ----------
    this.status('Issuing');
    this.step('offer_prepared', 'active');
    let handle: IssuanceHandle;
    if (preAuth) {
      handle = await this.attempt('offer_prepared', () => issuer.prepareIssuance(this.ctx));
      if (handle.offerId) register(this.run.id, handle.offerId);
      const created = getExchangesByRun(this.run.id).find(
        (e) => e.step === ProtocolStep.VCI_CREDENTIAL_OFFER && e.method === 'POST',
      );
      const oob = this.outOfBand(
        'certify',
        ProtocolStep.VCI_CREDENTIAL_OFFER,
        handle.offerUri!,
        ['offer'],
        handle.offerId ? [handle.offerId] : [],
      );
      this.artifact('offer', handle.offerUri!, oob);
      this.step('offer_prepared', 'done', {
        evidenceKind: 'adapter',
        exchangeId: created?.id ?? oob,
      });
    } else {
      // Wallet-initiated (Inji Web): nothing to create; bind the next issuance flow to this run.
      handle = {};
      arm(this.run.id, 'certify', this.settings.humanTimeoutMs * 3);
      this.step('offer_prepared', 'done', { evidenceKind: 'adapter' });
    }

    this.step('offer_delivered', 'active');
    const delivery = await this.attempt('offer_delivered', async () =>
      wallet.issuanceDelivery(handle),
    );
    this.delivery('issuance', delivery);
    const accepting: Promise<HeldCredential> | undefined = wallet.acceptOffer?.(this.ctx, handle);
    accepting?.catch(() => {}); // observed through waitFor
    const fromWallet = (ex: Exchange) => ex.from !== 'bff' && !ex.outOfBand;

    this.done(
      'offer_delivered',
      await this.waitFor(
        'offer_delivered',
        (ex) =>
          fromWallet(ex) &&
          (preAuth
            ? ex.step === ProtocolStep.VCI_CREDENTIAL_OFFER && ex.method === 'GET'
            : ex.step === ProtocolStep.VCI_AUTHORIZE || ex.step === ProtocolStep.VCI_TOKEN),
        accepting,
      ),
    );

    this.step(ProtocolStep.VCI_TOKEN, 'active');
    this.done(
      ProtocolStep.VCI_TOKEN,
      await this.waitFor(
        ProtocolStep.VCI_TOKEN,
        (ex) => fromWallet(ex) && ex.step === ProtocolStep.VCI_TOKEN,
        accepting,
      ),
    );

    this.step(ProtocolStep.VCI_CREDENTIAL, 'active');
    const issued = await this.waitFor(
      ProtocolStep.VCI_CREDENTIAL,
      (ex) => fromWallet(ex) && ex.step === ProtocolStep.VCI_CREDENTIAL,
      accepting,
    );
    const credentialRaw =
      credentialFromBody(issued.exchange?.response?.body) ??
      (accepting ? (await accepting).raw : undefined);
    if (credentialRaw)
      this.artifact('credential', credentialRaw, issued.exchange?.id, config.format);
    this.done(ProtocolStep.VCI_CREDENTIAL, issued);
    disarm(this.run.id);

    // ---------- holding ----------
    this.status('Holding');
    this.step('credential_held', 'active');
    let held: HeldCredential | undefined;
    if (accepting) {
      held = await this.attempt('credential_held', () => accepting);
      this.step('credential_held', 'done', { evidenceKind: 'adapter' });
    } else {
      await this.waitManual('credential_held', this.settings.manualTimeoutMs);
      this.step('credential_held', 'done', { evidenceKind: 'manual' });
    }
    this.run.delivery = undefined;

    // ---------- presenting ----------
    this.status('Presenting');
    this.step('request_created', 'active');
    const credentialType = await this.credentialType();
    const request = await this.attempt('request_created', () =>
      verifier.createPresentationRequest(this.ctx, {
        id: config.credentialConfigurationId,
        format: config.format,
        credentialType,
        purpose: `Interop playground run ${this.run.id.slice(0, 8)}: present the ${credentialType} credential`,
      }),
    );
    register(this.run.id, request.requestId, request.transactionId);
    const created = getExchangesByRun(this.run.id).find(
      (e) => e.step === ProtocolStep.VERIFY_CREATE_REQUEST,
    );
    const authOob = this.outOfBand(
      'verify',
      ProtocolStep.VP_AUTH_REQUEST,
      request.authorizationRequestUri,
      ['auth_request'],
      [request.requestId],
    );
    this.artifact('auth_request', request.authorizationRequestUri, authOob);
    this.artifact(
      'presentation_definition',
      JSON.stringify(request.presentationDefinition, null, 2),
      created?.id,
    );
    this.step('request_created', 'done', {
      evidenceKind: 'adapter',
      exchangeId: created?.id ?? authOob,
    });

    this.step('request_delivered', 'active');
    this.delivery('presentation', wallet.presentationDelivery(this.ctx, request));
    const tamper = this.tamperFor(config);
    const responding = wallet.respond?.(this.ctx, request, {
      ...(held ? { credentialId: held.id } : {}),
      ...(tamper ? { tamper } : {}),
    });
    responding?.catch(() => {});
    const submitted = this.pollUntilSubmitted(request);
    submitted.catch(() => {});
    // The wallet answering (adapter) or Inji Verify reporting the submission both prove delivery.
    const anyProof = Promise.any([
      responding ?? Promise.reject(new Error('no adapter')),
      submitted,
    ]);
    anyProof.catch(() => {});

    const fetched = await this.waitFor(
      'request_delivered',
      (ex) => fromWallet(ex) && ex.step === ProtocolStep.VP_REQUEST_OBJECT,
      responding ?? submitted,
    );
    this.done('request_delivered', fetched);
    if (fetched.exchange) {
      this.artifact(
        'auth_request',
        fetched.exchange.response?.body ?? request.authorizationRequestUri,
        fetched.exchange.id,
      );
      const pd = presentationDefinitionFrom(fetched.exchange.response?.body);
      if (pd) this.artifact('presentation_definition', pd, fetched.exchange.id);
      this.done(ProtocolStep.VP_REQUEST_OBJECT, fetched);
    } else if (!request.authorizationRequestUri.includes('request_uri=')) {
      // By-value requests have no request object to fetch.
      this.step(ProtocolStep.VP_REQUEST_OBJECT, 'skipped');
    } else this.done(ProtocolStep.VP_REQUEST_OBJECT, fetched);

    this.step(ProtocolStep.VP_RESPONSE, 'active');
    const posted = await this.waitFor(
      ProtocolStep.VP_RESPONSE,
      (ex) => fromWallet(ex) && ex.step === ProtocolStep.VP_RESPONSE,
      anyProof,
    );
    if (posted.exchange?.request.body) {
      const form = new URLSearchParams(posted.exchange.request.body);
      const vpToken = form.get('vp_token');
      const submission = form.get('presentation_submission');
      if (vpToken) this.artifact('vp_token', vpToken, posted.exchange.id, config.format);
      if (submission) this.artifact('presentation_submission', submission, posted.exchange.id);
      if (form.get('error')) {
        throw new StepOutcome(ProtocolStep.VP_RESPONSE, 'failed', {
          message: `The wallet declined: ${form.get('error')}${form.get('error_description') ? ` (${form.get('error_description')})` : ''}`,
        });
      }
    }
    this.done(ProtocolStep.VP_RESPONSE, posted);
    if (responding) {
      const answer = await this.attempt(ProtocolStep.VP_RESPONSE, () => responding);
      for (const warning of answer.warnings) {
        this.finding({
          checkId: 'VP-REQ-001',
          stage: 'presentation',
          severity: 'WARN',
          message: warning,
          specRef: 'OpenID4VP — signed request object (JAR) by reference',
        });
      }
    }
    this.run.delivery = undefined;

    // ---------- verifying ----------
    this.status('Verifying');
    this.step(ProtocolStep.VERIFY_RESULT, 'active');
    await submitted.catch(() => undefined);
    const result = await this.attempt(ProtocolStep.VERIFY_RESULT, () =>
      verifier.fetchResult(this.ctx, request),
    );
    const resultExchange = getExchangesByRun(this.run.id)
      .filter((e) => e.step === ProtocolStep.VERIFY_RESULT)
      .at(-1);
    this.artifact(
      'verification_result',
      JSON.stringify(result.verifierRaw, null, 2),
      resultExchange?.id,
    );
    this.run.observedOutcome = result.outcome;
    this.run.result = {
      outcome: result.outcome,
      perCredential: result.perCredential,
      verifierRaw: result.verifierRaw,
    };
    publish({
      type: 'run.result',
      runId: this.run.id,
      outcome: result.outcome,
      verifierRaw: result.verifierRaw,
    });
    if (result.reason && result.outcome !== config.expectedOutcome)
      this.run.errorSummary = `Verifier: ${result.reason}`;
    this.step(ProtocolStep.VERIFY_RESULT, 'done', {
      evidenceKind: 'adapter',
      ...(resultExchange ? { exchangeId: resultExchange.id } : {}),
    });
    this.finish();
  }

  /** Long-polls Inji Verify until the wallet has submitted; rejects if the request expires. */
  private async pollUntilSubmitted(request: PresentationRequestHandle): Promise<void> {
    const deadline = Date.now() + this.timeout() * 2;
    while (Date.now() < deadline) {
      if (this.ctx.signal.aborted) throw new Cancelled();
      const status = await this.adapters.verifier.pollStatus(this.ctx, request);
      if (status === 'VP_SUBMITTED') return;
      if (status === 'EXPIRED') {
        throw new StepOutcome('request_delivered', 'inconclusive', {
          message: 'The presentation request expired before the wallet answered',
        });
      }
    }
    throw new StepOutcome('request_delivered', this.headless ? 'failed' : 'inconclusive', {
      message: 'The wallet did not answer the presentation request in time',
    });
  }

  /** The `type` (JSON-LD) or `vct` (SD-JWT) the issuer advertises for the run's configuration. */
  private async credentialType(): Promise<string> {
    const id = this.run.config.credentialConfigurationId;
    try {
      const configs = await this.adapters.issuer.listCredentialConfigurations();
      return configs.find((c) => c.id === id)?.credentialType ?? id;
    } catch {
      return id;
    }
  }

  /** An Invalid run with a wallet that can tamper breaks the issuer's signature (plan §13 T-SIG-FLIP). */
  private tamperFor(config: RunConfig): MockWalletTamper | undefined {
    const requested = config.tamper?.id;
    if (requested === 'T-SIG-FLIP' || requested === 'T-CLAIM-EDIT') return requested;
    if (config.expectedOutcome === 'INVALID' && this.walletEntry.capabilities.supportsTamper)
      return 'T-SIG-FLIP';
    return undefined;
  }

  private reportUrl = () => `/api/runs/${this.run.id}/report?format=md`;

  /** Evaluating → Reported, applying the plan §6 verdict rule. */
  private finish() {
    this.status('Evaluating');
    for (const s of this.run.steps)
      if (s.status === 'pending' || s.status === 'active') this.step(s.step, 'skipped');
    const steps = this.run.steps;
    const inconclusive = steps.some((s) => s.status === 'inconclusive');
    const failed =
      steps.some((s) => s.status === 'failed') || (!this.run.observedOutcome && !inconclusive);
    const matched = !failed && this.run.observedOutcome === this.run.config.expectedOutcome;
    const warned = this.record.findings.some((f) => f.severity === 'WARN');
    const verdict: InteropVerdict = inconclusive
      ? 'INCONCLUSIVE'
      : matched
        ? warned
          ? 'PASS_WITH_WARNINGS'
          : 'PASS'
        : this.run.prediction?.status === 'unsupported'
          ? 'NOT_APPLICABLE'
          : 'FAIL';
    this.run.verdict = verdict;
    if (!matched && !this.run.errorSummary) {
      const bad = steps.find((s) => s.error);
      this.run.errorSummary =
        bad?.error?.message ??
        (this.run.observedOutcome
          ? `Expected ${this.run.config.expectedOutcome}, verifier returned ${this.run.observedOutcome}`
          : undefined);
    }
    this.run.delivery = undefined;
    this.status('Reported');
    publish({ type: 'run.completed', runId: this.run.id, verdict, reportUrl: this.reportUrl() });
    this.persist();
  }

  private cancel() {
    for (const s of this.run.steps)
      if (s.status === 'pending' || s.status === 'active') this.step(s.step, 'skipped');
    this.record.manualWaiters.clear();
    this.run.delivery = undefined;
    this.run.errorSummary = 'Cancelled by user';
    this.status('Cancelled');
    this.persist();
  }
}

/** The credential in a credential endpoint response: draft 13 `credential`, or 1.0 `credentials[0]`. */
export function credentialFromBody(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const json = JSON.parse(body) as {
      credential?: unknown;
      credentials?: Array<{ credential?: unknown }>;
    };
    const c = json.credential ?? json.credentials?.[0]?.credential;
    if (c === undefined || c === null) return undefined;
    return typeof c === 'string' ? c : JSON.stringify(c);
  } catch {
    return undefined;
  }
}

/** presentation_definition from a request object (signed JWT or JSON). */
export function presentationDefinitionFrom(body: string | undefined): string | undefined {
  if (!body) return undefined;
  const d = decodeBody(body);
  const payload =
    d.kind === 'jwt'
      ? d.jwt.payload
      : d.kind === 'json'
        ? (d.value as Record<string, unknown>)
        : undefined;
  const pd = payload?.['presentation_definition'];
  return pd ? JSON.stringify(pd, null, 2) : undefined;
}
