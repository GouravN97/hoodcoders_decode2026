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
  formatLabel,
  modeLabel,
  planTamper,
  predict,
  ProtocolStep,
  runUsesPhase,
  runUsesRole,
  stepLabel,
  stepTemplateFor,
  SUPPORTED_RUN_MODES,
  TamperPlanError,
  tamperDiffText,
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
  type RunPhase,
  type RunState,
  type RunStep,
  type StepError,
  type StepStatus,
  type TamperEvidence,
  type TamperPlan,
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
import type { ImplementationRegistry } from '../catalog/registry.ts';
import { decodeBody } from '../decoder/payload-decoder.ts';
import { arm, disarm, register } from '../tap/correlator.ts';
import {
  addExchange,
  exchangeEvents,
  getExchangesByRun,
  markTampered,
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

/** The type a T-WRONG-TYPE run asks for: no issuer in the catalog issues it. */
export const WRONG_CREDENTIAL_TYPE = 'PlaygroundWrongTypeCredential';


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

const TEMPLATE_STEPS: string[] = stepTemplateFor('full').map((t) => t.step);

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
    if (!SUPPORTED_RUN_MODES.includes(config.mode))
      throw new RunConfigError(`${modeLabel(config.mode)} runs are not supported yet`);

    const catalog = await this.registry.list(30_000);
    let planned: ReturnType<typeof planTamper>;
    try {
      planned = planTamper(config, catalog, this.store.list());
    } catch (e) {
      if (e instanceof TamperPlanError) throw new RunConfigError(e.message);
      throw e;
    }
    config = planned.config;
    const run: RunDetail = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      trigger,
      config,
      state: 'Configured',
      prediction: predict(config, catalog),
      // Wallet-initiated issuance is bound to the run by time window; everything else by key.
      correlation:
        runUsesPhase(config.mode, 'issuing') && config.grantType === 'authorization_code'
          ? 'heuristic'
          : 'exact',
      steps: stepTemplateFor(config.mode).map((t) => ({
        phase: t.phase,
        step: t.step,
        status: 'pending' as const,
      })),
      // Snapshot of what ran, so history stays right after the catalog or a module changes.
      versions: (
        [
          ['issuer', config.issuerId],
          ['wallet', config.walletId],
          ['verifier', config.verifierId],
        ] as const
      ).map(([role, id]) => {
        const entry = catalog.find((c) => c.id === id);
        return {
          implementationId: id,
          role,
          version: entry?.version ?? 'unknown',
          ...(entry ? { displayName: entry.displayName } : {}),
        };
      }),
      ...(planned.tamper ? { tamper: planned.tamper.applied } : {}),
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
      planned.tamper,
      catalog,
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

/** What the presenting phase hands to the verifying phase. */
interface Presentation {
  request: PresentationRequestHandle;
  /** Settles once Inji Verify reports the wallet's submission. */
  submitted: Promise<void>;
}

/** A protocol message the wallet sent (not the BFF, not an out-of-band QR payload). */
const fromWallet = (ex: Exchange) => ex.from !== 'bff' && !ex.outOfBand;

class RunExecution {
  private readonly ctx: RunContext;
  private readonly headless: boolean;
  /** A tampered submission the verifier refused at direct_post (an answer, not a wallet failure). */
  private rejectedAtSubmission?: { status: number; body?: string };

  constructor(
    private readonly record: RunRecord,
    private readonly adapters: Adapters,
    private readonly walletEntry: CatalogEntry,
    private readonly settings: OrchestratorSettings,
    private readonly persist: () => void,
    private readonly tamper?: TamperPlan,
    /** The catalog the prediction was made from; its health may be up to 30 s old. */
    private readonly catalog: CatalogEntry[] = [],
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

  private uses(phase: RunPhase) {
    return runUsesPhase(this.run.config.mode, phase);
  }

  /**
   * Runs the phases the run mode asks for (shared RUN_MODE_PHASES). Issuing and presenting never
   * share in-memory state: a present-only run starts from what the wallet already holds, exactly
   * as a separate relying party would meet it.
   */
  private async play(): Promise<void> {
    if (!(await this.preflight())) return;

    let held: HeldCredential | undefined;
    if (this.uses('issuing')) {
      const issuance = await this.issuePhase();
      held = issuance.manuallyHeld ? undefined : await this.holdIssued(issuance.accepting);
    } else {
      held = await this.holdExisting();
    }

    if (this.uses('presenting')) {
      const presentation = await this.presentPhase(held);
      await this.verifyPhase(presentation);
    }
    this.finish();
  }

  /** Health of the roles this run actually talks to; false when the run was aborted. */
  private async preflight(): Promise<boolean> {
    const { issuer, wallet, verifier } = this.adapters;
    const mode = this.run.config.mode;
    this.status('Preflight');
    const required: Array<[string, Promise<string>]> = [
      ...(runUsesRole(mode, 'issuer')
        ? [[issuer.descriptor.displayName, issuer.healthCheck()] as [string, Promise<string>]]
        : []),
      ...(runUsesRole(mode, 'verifier')
        ? [[verifier.descriptor.displayName, verifier.healthCheck()] as [string, Promise<string>]]
        : []),
      ...(this.headless
        ? [[wallet.descriptor.displayName, wallet.healthCheck()] as [string, Promise<string>]]
        : []),
    ];
    const down = [];
    for (const [name, health] of required) if ((await health) === 'down') down.push(name);
    if (down.length === 0) {
      // The prediction used cached health; the roles just checked are up, so a stale "not
      // responding" must not later turn a real failure into "known unsupported".
      const checked = [
        ...(runUsesRole(mode, 'issuer') ? [issuer.descriptor.id] : []),
        ...(runUsesRole(mode, 'verifier') ? [verifier.descriptor.id] : []),
        ...(this.headless ? [wallet.descriptor.id] : []),
      ];
      if (this.catalog.length > 0) {
        this.run.prediction = predict(
          this.run.config,
          this.catalog.map((e) => (checked.includes(e.id) ? { ...e, health: 'up' as const } : e)),
        );
      }
      return true;
    }

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
    return false;
  }

  // ---------- issuing ----------

  /**
   * OpenID4VCI from offer to credential. Returns the headless wallet's acceptance, if any, wrapped
   * so the async return does not wait on it.
   */
  private async issuePhase(): Promise<{
    accepting?: Promise<HeldCredential>;
    manuallyHeld?: boolean;
  }> {
    const { issuer, wallet } = this.adapters;
    const config = this.run.config;
    const preAuth = config.grantType === 'pre-authorized_code';

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
        issuer.descriptor.id,
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

    // Hovi and Animo receive the wallet's protocol calls directly; those requests cannot pass
    // through our local Tap. Keep the QR visible while the holder checks the wallet, then use that
    // explicit confirmation as evidence that the offer, token and credential steps completed.
    if (handle.observation === 'manual') {
      this.step('offer_delivered', 'done', { evidenceKind: 'adapter' });
      this.status('Holding');
      this.step('credential_held', 'active');
      await this.waitManual('credential_held', this.settings.manualTimeoutMs);
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
      return { manuallyHeld: true };
    }

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
    return accepting ? { accepting } : {};
  }

  // ---------- holding ----------

  /** After issuing: the headless wallet's word, or the person confirming on the run screen. */
  private async holdIssued(
    accepting: Promise<HeldCredential> | undefined,
  ): Promise<HeldCredential | undefined> {
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
    return held;
  }

  /**
   * present-only: no issuer involved. A wallet the playground can look into is asked for the
   * credential (by id, or the newest matching one); for a phone or Inji Web the person confirms
   * the credential is already in the wallet.
   */
  private async holdExisting(): Promise<HeldCredential | undefined> {
    const { wallet } = this.adapters;
    const config = this.run.config;
    this.status('Holding');
    this.step('credential_held', 'active');

    if (!wallet.listCredentials) {
      await this.waitManual('credential_held', this.settings.manualTimeoutMs);
      this.step('credential_held', 'done', { evidenceKind: 'manual' });
      return undefined;
    }

    const all = await this.attempt('credential_held', () =>
      wallet.listCredentials!(this.ctx.signal),
    );
    const held = pickHeldCredential(all, config);
    if (!held) {
      const name = wallet.descriptor.displayName;
      throw new StepOutcome('credential_held', 'failed', {
        message: config.heldCredentialId
          ? `${name} holds no ${formatLabel(config.format)} credential with id ${config.heldCredentialId}`
          : `${name} holds no ${formatLabel(config.format)} ${config.credentialConfigurationId} credential. Run an issue-only or full run first.`,
      });
    }
    this.artifact('credential', held.raw, undefined, held.format);
    this.step('credential_held', 'done', { evidenceKind: 'adapter' });
    return held;
  }

  // ---------- presenting ----------

  /** OpenID4VP: create the request, deliver it, observe the wallet's vp_token. */
  private async presentPhase(held: HeldCredential | undefined): Promise<Presentation> {
    const { wallet, verifier } = this.adapters;
    const config = this.run.config;

    this.status('Presenting');
    this.step('request_created', 'active');
    // T-WRONG-TYPE asks for a type the held credential does not have.
    const credentialType =
      this.tamper?.def.id === 'T-WRONG-TYPE'
        ? WRONG_CREDENTIAL_TYPE
        : await this.credentialType(held);
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
    const hook =
      this.tamper?.def.mechanism === 'wallet-hook'
        ? (this.tamper.def.id as MockWalletTamper)
        : undefined;
    const credentialId = held?.id ?? config.heldCredentialId;
    const responding = wallet.respond?.(this.ctx, request, {
      ...(credentialId ? { credentialId } : {}),
      ...(hook ? { tamper: hook } : {}),
      ...(this.tamper?.replay ? { replay: this.tamper.replay } : {}),
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
    const isResponse = (ex: Exchange) => fromWallet(ex) && ex.step === ProtocolStep.VP_RESPONSE;
    let posted: Evidence;
    try {
      posted = await this.waitFor(ProtocolStep.VP_RESPONSE, isResponse, anyProof);
    } catch (e) {
      // A verifier refusing a tampered submission outright has answered the run's question.
      const status = e instanceof StepOutcome ? (e.error.status ?? 0) : 0;
      if (!this.tamper || status < 400 || status >= 500) throw e;
      const exchange = getExchangesByRun(this.run.id).filter(isResponse).at(-1);
      posted = { kind: 'tap', ...(exchange ? { exchange } : {}) };
      this.rejectedAtSubmission = {
        status,
        ...((e as StepOutcome).error.body ? { body: (e as StepOutcome).error.body } : {}),
      };
    }
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
      if (this.tamper && answer.status >= 400 && answer.status < 500) {
        this.rejectedAtSubmission ??= {
          status: answer.status,
          ...(answer.body ? { body: answer.body } : {}),
        };
      }
      if (answer.tamperEvidence) this.recordTamper(answer.tamperEvidence, posted.exchange);
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
    if (this.rejectedAtSubmission) {
      this.finding({
        checkId: 'TAMPER-002',
        stage: 'presentation',
        severity: 'INFO',
        message: `The verifier refused the tampered submission at direct_post with HTTP ${this.rejectedAtSubmission.status}`,
        specRef: 'OpenID4VP — response mode direct_post',
        ...(posted.exchange ? { exchangeId: posted.exchange.id } : {}),
      });
    }
    this.run.delivery = undefined;
    return { request, submitted };
  }

  /** Marks the exchange that carried the tampered payload and keeps the payload as an artifact. */
  private recordTamper(evidence: TamperEvidence, exchange: Exchange | undefined) {
    const applied = this.run.tamper;
    if (!applied) return;
    if (exchange) {
      markTampered(exchange.id, {
        ruleId: applied.id,
        diff: tamperDiffText(evidence),
        target: evidence.target,
        ...(evidence.before ? { before: evidence.before } : {}),
        ...(evidence.after ? { after: evidence.after } : {}),
      });
    }
    if (evidence.after) {
      this.artifact(
        evidence.target === 'credential' ? 'tampered_credential' : 'tampered_vp',
        evidence.after,
        exchange?.id,
        this.run.config.format,
      );
    }
    this.run.tamper = {
      ...applied,
      summary: evidence.summary,
      ...(exchange ? { exchangeId: exchange.id } : {}),
    };
  }

  // ---------- verifying ----------

  private async verifyPhase({ request, submitted }: Presentation): Promise<void> {
    const { verifier } = this.adapters;
    const config = this.run.config;
    this.status('Verifying');
    this.step(ProtocolStep.VERIFY_RESULT, 'active');
    const refused = this.rejectedAtSubmission;
    // A refused submission never reaches VP_SUBMITTED, so do not wait for it.
    if (!refused) await submitted.catch(() => undefined);
    const result = await this.attempt(ProtocolStep.VERIFY_RESULT, () =>
      verifier.fetchResult(this.ctx, request),
    ).catch((e: unknown) => {
      if (!refused) throw e;
      return {
        outcome: 'REJECTED' as const,
        perCredential: [],
        verifierRaw: { directPostStatus: refused.status, directPostBody: refused.body },
        reason: `direct_post answered HTTP ${refused.status}`,
      };
    });
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

  /**
   * The `type` (JSON-LD) or `vct` (SD-JWT) to request. A present-only run reads it from the held
   * credential itself; otherwise (or when that fails) from the issuer's published metadata.
   */
  private async credentialType(held?: HeldCredential): Promise<string> {
    const id = this.run.config.credentialConfigurationId;
    if (!this.uses('issuing') && held) {
      const own = credentialTypeOf(held.raw);
      if (own) return own;
    }
    try {
      const configs = await this.adapters.issuer.listCredentialConfigurations();
      return configs.find((c) => c.id === id)?.credentialType ?? id;
    } catch {
      return id;
    }
  }

  private reportUrl = () => `/api/runs/${this.run.id}/report?format=md`;

  /** Evaluating → Reported, applying the plan §6 verdict rule. */
  private finish() {
    this.status('Evaluating');
    for (const s of this.run.steps)
      if (s.status === 'pending' || s.status === 'active') this.step(s.step, 'skipped');
    const steps = this.run.steps;
    const inconclusive = steps.some((s) => s.status === 'inconclusive');
    // An issue-only run passes once the credential is in the wallet; the others are judged on
    // the verifier's answer.
    const verifies = this.uses('verifying');
    const failed =
      steps.some((s) => s.status === 'failed') ||
      (verifies && !this.run.observedOutcome && !inconclusive);
    const observed = this.run.observedOutcome;
    // A tamper run asks one question: did the verifier refuse it? Refusing with another status
    // than expected (e.g. Rejected instead of Invalid) still passes, with a warning.
    const tamperCaught = Boolean(this.run.tamper && observed && observed !== 'VALID');
    if (this.run.tamper && verifies && observed) this.tamperFinding(observed);
    const matched =
      !failed &&
      (verifies
        ? observed === this.run.config.expectedOutcome || tamperCaught
        : steps.every((s) => s.status === 'done'));
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

  private tamperFinding(observed: NonNullable<RunDetail['observedOutcome']>) {
    const tamper = this.run.tamper!;
    const verifier = this.adapters.verifier.descriptor.displayName;
    const caught = observed !== 'VALID';
    this.finding({
      checkId: 'TAMPER-001',
      stage: 'verification',
      severity: !caught ? 'FAIL' : observed === tamper.expectedOutcome ? 'PASS' : 'WARN',
      message: !caught
        ? `${verifier} accepted a presentation the playground had tampered with (${tamper.id} ${tamper.label.toLowerCase()})`
        : observed === tamper.expectedOutcome
          ? `${verifier} rejected the ${tamper.id} presentation as expected`
          : `${verifier} rejected the ${tamper.id} presentation as ${observed}, not the expected ${tamper.expectedOutcome}`,
      specRef: 'Playground tamper catalogue (plan §13)',
      ...(tamper.exchangeId ? { exchangeId: tamper.exchangeId } : {}),
    });
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

/**
 * present-only: the credential to present. `heldCredentialId` wins when set (and must match the
 * run's format); otherwise the newest credential of the run's format and configuration.
 */
export function pickHeldCredential(
  held: HeldCredential[],
  config: Pick<RunConfig, 'format' | 'credentialConfigurationId' | 'heldCredentialId'>,
): HeldCredential | undefined {
  if (config.heldCredentialId)
    return held.find((c) => c.id === config.heldCredentialId && c.format === config.format);
  return held
    .filter(
      (c) =>
        c.format === config.format &&
        c.credentialConfigurationId === config.credentialConfigurationId,
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
}

/** `vct` of an SD-JWT VC, or the most specific `type` of a JSON-LD VC. */
export function credentialTypeOf(raw: string): string | undefined {
  const d = decodeBody(raw);
  if (d.kind === 'sd-jwt' || d.kind === 'jwt') {
    const vct = (d.kind === 'sd-jwt' ? d.issuerJwt : d.jwt).payload['vct'];
    return typeof vct === 'string' && vct ? vct : undefined;
  }
  if (d.kind === 'json') {
    const type = (d.value as { type?: unknown }).type;
    const types = Array.isArray(type) ? type : [type];
    const specific = types.filter(
      (t): t is string => typeof t === 'string' && t !== 'VerifiableCredential',
    );
    return specific.at(-1);
  }
  return undefined;
}
