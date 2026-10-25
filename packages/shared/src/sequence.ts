// SequenceDiagramBuilder (plan §8.2, good-to-have G3): turns a run's captured exchanges into a
// Mermaid sequence diagram. Every arrow drawn from a captured exchange carries its id, so the UI can
// jump to it. Steps the playground only inferred (a wallet talking to an external issuer, the
// wallet handing the request to its OpenID4VP library) are drawn dashed and say so: the diagram
// never implies a message was captured when it was not.
import { z } from 'zod';
import type { CatalogEntry } from './catalog';
import { ProtocolStep, type Exchange, type RunConfig } from './domain';
import { artifactLabel, protocolStepLabel } from './labels';
import type { RunStep } from './run';
import type { AppliedTamper } from './tamper';

/** `openid4vp`: the presentation only, Verifier ↔ Wallet ↔ Library. `full`: the whole run. */
export const SequenceViewSchema = z.enum(['openid4vp', 'full']);
export type SequenceView = z.infer<typeof SequenceViewSchema>;

export const SequenceLaneIdSchema = z.enum([
  'playground',
  'issuer',
  'mimoto',
  'wallet',
  'library',
  'verifier',
  'other',
]);
export type SequenceLaneId = z.infer<typeof SequenceLaneIdSchema>;

export const SequenceLaneSchema = z.object({
  id: SequenceLaneIdSchema,
  /** Mermaid participant alias. */
  alias: z.string(),
  label: z.string(),
  /** Second line under the name, e.g. "behind the Protocol Tap". */
  detail: z.string().optional(),
});
export type SequenceLane = z.infer<typeof SequenceLaneSchema>;

/**
 * `observed`: captured by the Protocol Tap or recorded by the BFF. `out-of-band`: a QR code or link
 * the playground handed to the wallet. `failed`: an observed exchange answered with an error.
 * `inferred`: not captured; the step is known only from the wallet adapter or a person.
 */
export const SequenceMessageKindSchema = z.enum(['observed', 'out-of-band', 'failed', 'inferred']);
export type SequenceMessageKind = z.infer<typeof SequenceMessageKindSchema>;

export const SequenceMessageSchema = z.object({
  type: z.literal('message'),
  from: SequenceLaneIdSchema,
  to: SequenceLaneIdSchema,
  label: z.string(),
  kind: SequenceMessageKindSchema,
  /** The captured exchange the arrow stands for (the last one when several were collapsed). */
  exchangeId: z.string().optional(),
  /** Repeated identical exchanges (status polls) collapsed into one arrow. */
  count: z.number().int().optional(),
  /** The exchange carried a tampered payload. */
  tampered: z.boolean().optional(),
});
export type SequenceMessage = z.infer<typeof SequenceMessageSchema>;

export const SequenceNoteSchema = z.object({
  type: z.literal('note'),
  over: z.array(SequenceLaneIdSchema),
  text: z.string(),
});
export type SequenceNote = z.infer<typeof SequenceNoteSchema>;

export const SequenceItemSchema = z.discriminatedUnion('type', [SequenceMessageSchema, SequenceNoteSchema]);
export type SequenceItem = z.infer<typeof SequenceItemSchema>;

export const SequenceModelSchema = z.object({
  view: SequenceViewSchema,
  lanes: z.array(SequenceLaneSchema),
  items: z.array(SequenceItemSchema),
});
export type SequenceModel = z.infer<typeof SequenceModelSchema>;

/** GET /api/runs/:id/sequence */
export const SequenceResponseSchema = z.object({
  view: SequenceViewSchema,
  source: z.string(),
  model: SequenceModelSchema,
});

export type SequenceExchange = Pick<
  Exchange,
  'id' | 'seq' | 'from' | 'component' | 'method' | 'url' | 'status' | 'step' | 'outOfBand' | 'tampered'
>;

export interface SequenceInput {
  config: Pick<RunConfig, 'issuerId' | 'walletId' | 'verifierId'>;
  exchanges: SequenceExchange[];
  steps: Pick<RunStep, 'step' | 'status' | 'evidenceKind' | 'exchangeId'>[];
  catalog: Array<Pick<CatalogEntry, 'id' | 'displayName' | 'vendor'>>;
  tamper?: AppliedTamper;
}

/** Where a wallet's OpenID4VP code runs; named in the Library lane. */
const LIBRARY_LABEL: Record<string, string> = {
  'inji-wallet-mobile': 'inji-openid4vp',
  'inji-web': 'Mimoto OpenID4VP',
  'mock-wallet': 'Mock wallet OpenID4VP code',
};

const ALIAS: Record<SequenceLaneId, string> = {
  playground: 'P',
  issuer: 'I',
  mimoto: 'M',
  wallet: 'W',
  library: 'L',
  verifier: 'V',
  other: 'O',
};

const LANE_ORDER: Record<SequenceView, SequenceLaneId[]> = {
  full: ['playground', 'issuer', 'mimoto', 'wallet', 'library', 'verifier', 'other'],
  // The order the problem statement names: Verifier ↔ Wallet ↔ Library.
  openid4vp: ['playground', 'verifier', 'mimoto', 'wallet', 'library', 'other'],
};

const isIssuance = (step: string) => step.startsWith('oid4vci.');
const isPresentation = (step: string) => step.startsWith('oid4vp.') || step.startsWith('verify.');

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return `/${parts.slice(-2).join('/')}`;
  } catch {
    return url;
  }
}

function exchangeLabel(ex: SequenceExchange): string {
  if (ex.outOfBand) {
    const what =
      ex.step === ProtocolStep.VCI_CREDENTIAL_OFFER
        ? artifactLabel('offer')
        : ex.step === ProtocolStep.VP_AUTH_REQUEST
          ? artifactLabel('auth_request')
          : protocolStepLabel(ex.step);
    return `${what} (QR / link)`;
  }
  // Short labels keep the lanes close together; method, URL and body are one click away.
  const status = ex.status === undefined ? '…' : String(ex.status);
  const name = ex.step === ProtocolStep.UNKNOWN ? shortPath(ex.url) : protocolStepLabel(ex.step);
  return `${name} · ${status}`;
}

/**
 * The run's message sequence for one view. Exchanges come in `seq` order; inferred messages are
 * placed where the protocol puts them.
 */
export function buildSequence(input: SequenceInput, view: SequenceView): SequenceModel {
  const { config, steps, catalog, tamper } = input;
  const exchanges = [...input.exchanges].sort((a, b) => a.seq - b.seq);
  const name = (id: string) => catalog.find((c) => c.id === id)?.displayName ?? id;
  const issuerExternal = catalog.find((c) => c.id === config.issuerId)?.vendor === 'external';
  const webWallet = config.walletId === 'inji-web';
  const stepOf = (id: string) => steps.find((s) => s.step === id);

  const sourceLane = (ex: SequenceExchange): SequenceLaneId => {
    if (ex.from === 'bff') return 'playground';
    if (ex.from === 'wallet') return 'wallet';
    // The tap only knows a Java user agent; that is Mimoto when Inji Web is the wallet.
    if (ex.from === 'mimoto') return webWallet ? 'mimoto' : 'other';
    return 'other';
  };
  const targetLane = (ex: SequenceExchange): SequenceLaneId => {
    if (ex.outOfBand) return 'wallet';
    if (ex.component === 'certify' || ex.component === config.issuerId || isIssuance(ex.step))
      return 'issuer';
    return 'verifier';
  };

  // The presentation starts with the first presentation exchange; the OpenID4VP view shows only that.
  const firstPresentation = exchanges.find((e) => isPresentation(e.step))?.seq ?? Infinity;
  const shown = view === 'full' ? exchanges : exchanges.filter((e) => e.seq >= firstPresentation);

  const items: SequenceItem[] = [];
  const push = (m: Omit<SequenceMessage, 'type'>) => {
    const last = items.at(-1);
    // Collapse repeated identical exchanges (status polls) into one arrow.
    if (
      last?.type === 'message' &&
      m.exchangeId &&
      last.exchangeId &&
      last.from === m.from &&
      last.to === m.to &&
      last.label === m.label &&
      last.kind === m.kind
    ) {
      last.count = (last.count ?? 1) + 1;
      last.exchangeId = m.exchangeId;
      return;
    }
    items.push({ type: 'message', ...m });
  };

  const inferredIssuance = (): void => {
    const held = stepOf('credential_held');
    for (const id of [ProtocolStep.VCI_TOKEN, ProtocolStep.VCI_CREDENTIAL]) {
      const s = stepOf(id);
      if (s?.status !== 'done' || s.exchangeId) continue;
      if (exchanges.some((e) => e.step === id && e.from !== 'bff')) continue;
      push({
        from: webWallet ? 'mimoto' : 'wallet',
        to: 'issuer',
        label: `${protocolStepLabel(id)} · not observed (${s.evidenceKind === 'manual' ? 'holder confirmed' : 'wallet reported'})`,
        kind: 'inferred',
      });
    }
    if (held?.status === 'done' && held.evidenceKind === 'manual') {
      items.push({
        type: 'note',
        over: ['wallet'],
        text: 'The holder confirmed on the run page that the credential is in the wallet',
      });
    }
  };

  const libraryAndTamper = (): void => {
    // The wallet's hand-off to its OpenID4VP library is never on the network.
    items.push(
      {
        type: 'message',
        from: webWallet ? 'mimoto' : 'wallet',
        to: 'library',
        label: 'Request to library (inferred)',
        kind: 'inferred',
      },
      ...(tamper?.mechanism === 'wallet-hook'
        ? [
            {
              type: 'note' as const,
              over: ['library' as const],
              text: `${tamper.id}: ${tamper.summary ?? tamper.label}`,
            },
          ]
        : []),
      {
        type: 'message',
        from: 'library',
        to: webWallet ? 'mimoto' : 'wallet',
        label: 'vp_token built and signed (inferred)',
        kind: 'inferred',
      },
    );
  };

  if (view === 'full' && tamper?.mechanism === 'issuance-profile') {
    items.push({ type: 'note', over: ['issuer'], text: `${tamper.id}: ${tamper.summary ?? tamper.label}` });
  }

  let issuanceDone = false;
  let libraryDone = false;
  const responseStep = stepOf(ProtocolStep.VP_RESPONSE);
  for (const ex of shown) {
    if (view === 'full' && !issuanceDone && !isIssuance(ex.step) && isPresentation(ex.step)) {
      inferredIssuance();
      issuanceDone = true;
    }
    const fromWallet = ex.from !== 'bff' && !ex.outOfBand;
    if (!libraryDone && fromWallet && ex.step === ProtocolStep.VP_RESPONSE) {
      libraryAndTamper();
      libraryDone = true;
    }
    // The second opinion (VER-002) goes to the other verifier, which has no lane in this run.
    if (ex.step === ProtocolStep.VC_DIRECT_VERIFY && ex.from === 'bff') {
      items.push({
        type: 'note',
        over: ['playground'],
        text: `Second opinion from the other verifier · ${ex.status ?? '…'} (outside the protocol)`,
      });
      continue;
    }
    push({
      from: sourceLane(ex),
      to: targetLane(ex),
      label: exchangeLabel(ex),
      kind: ex.outOfBand
        ? 'out-of-band'
        : ex.status !== undefined && ex.status >= 400
          ? 'failed'
          : 'observed',
      exchangeId: ex.id,
      ...(ex.tampered ? { tampered: true } : {}),
    });
  }
  if (view === 'full' && !issuanceDone) inferredIssuance();
  // A presentation the wallet adapter reported but the tap did not capture.
  if (!libraryDone && responseStep?.status === 'done' && !responseStep.exchangeId) {
    libraryAndTamper();
    push({
      from: webWallet ? 'mimoto' : 'wallet',
      to: 'verifier',
      label: `${protocolStepLabel(ProtocolStep.VP_RESPONSE)} · not captured (wallet reported)`,
      kind: 'inferred',
    });
  }

  const used = new Set<SequenceLaneId>();
  for (const item of items) {
    if (item.type === 'message') used.add(item.from).add(item.to);
    else item.over.forEach((l) => used.add(l));
  }
  const issuerDetail = issuerExternal ? 'outside the Protocol Tap' : 'behind the Protocol Tap';
  const lane = (id: SequenceLaneId): SequenceLane => {
    switch (id) {
      case 'playground':
        return { id, alias: ALIAS[id], label: 'Playground', detail: 'BFF' };
      case 'issuer':
        return { id, alias: ALIAS[id], label: name(config.issuerId), detail: issuerDetail };
      case 'mimoto':
        return { id, alias: ALIAS[id], label: 'Mimoto', detail: 'wallet backend' };
      case 'wallet':
        return { id, alias: ALIAS[id], label: name(config.walletId), detail: 'wallet' };
      case 'library':
        return {
          id,
          alias: ALIAS[id],
          label: LIBRARY_LABEL[config.walletId] ?? 'OpenID4VP library',
          detail: 'inside the wallet, not observable',
        };
      case 'verifier':
        return { id, alias: ALIAS[id], label: name(config.verifierId), detail: 'behind the Protocol Tap' };
      case 'other':
        return { id, alias: ALIAS[id], label: 'Unidentified server client', detail: 'Java user agent' };
    }
  };
  return {
    view,
    lanes: LANE_ORDER[view].filter((id) => used.has(id)).map(lane),
    items,
  };
}

/** Mermaid message text: one line, without the characters Mermaid treats as syntax. */
const mermaidText = (s: string) => s.replace(/[;#\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

const ARROW: Record<SequenceMessageKind, string> = {
  observed: '->>',
  'out-of-band': '-)',
  failed: '-x',
  inferred: '--)',
};

/** Mermaid `sequenceDiagram` source. Messages appear in `items` order, so the n-th arrow is the n-th message. */
export function toMermaid(model: SequenceModel): string {
  const alias = (id: SequenceLaneId) => model.lanes.find((l) => l.id === id)?.alias ?? ALIAS[id];
  const lines = ['sequenceDiagram'];
  for (const l of model.lanes) {
    lines.push(
      `  participant ${l.alias} as ${mermaidText(l.label)}${l.detail ? `<br/>(${mermaidText(l.detail)})` : ''}`,
    );
  }
  for (const item of model.items) {
    if (item.type === 'note') {
      lines.push(`  Note over ${item.over.map(alias).join(',')}: ${mermaidText(item.text)}`);
      continue;
    }
    const text = `${item.tampered ? 'TAMPERED · ' : ''}${item.label}${item.count && item.count > 1 ? ` ×${item.count}` : ''}`;
    lines.push(`  ${alias(item.from)}${ARROW[item.kind]}${alias(item.to)}: ${mermaidText(text)}`);
  }
  return lines.join('\n');
}

/** The messages of a model, in the order Mermaid draws their arrows. */
export const sequenceMessages = (model: SequenceModel): SequenceMessage[] =>
  model.items.filter((i): i is SequenceMessage => i.type === 'message');
