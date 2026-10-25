// SequenceDiagramView (plan §9.3, good-to-have G3): the run's captured messages as an animated
// Mermaid sequence diagram. Arrows appear as live run events arrive; clicking one selects its message
// in the detail panel. Solid arrows were captured, dashed ones were not (see packages/shared sequence.ts).
import {
  buildSequence,
  sequenceMessages,
  toMermaid,
  type CatalogEntry,
  type ExchangeWithDecoded,
  type RunDetail,
  type SequenceMessage,
  type SequenceModel,
  type SequenceView,
} from '@playground/shared';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CopyButton, cx, EmptyState, Spinner, Tabs } from '../../components/ui';
import { useDebounced } from '../../hooks/useDebounced';
import { useTheme } from '../../theme';

const VIEWS: Array<{ id: SequenceView; label: string }> = [
  { id: 'openid4vp', label: 'OpenID4VP' },
  { id: 'full', label: 'Full run' },
];

const KIND_CLASS: Record<SequenceMessage['kind'], string> = {
  observed: 'seq-observed',
  'out-of-band': 'seq-oob',
  failed: 'seq-failed',
  inferred: 'seq-inferred',
};

/** Mermaid's `base` theme, coloured from the current theme's tokens. */
function themeVariables() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(`--c-${name}`).trim();
  return {
    fontFamily: css.getPropertyValue('font-family') || 'sans-serif',
    fontSize: '13px',
    background: token('surface'),
    primaryColor: token('surface-2'),
    primaryTextColor: token('fg'),
    primaryBorderColor: token('border'),
    lineColor: token('muted'),
    textColor: token('fg'),
    actorBkg: token('surface-2'),
    actorBorder: token('border'),
    actorTextColor: token('fg'),
    actorLineColor: token('border'),
    signalColor: token('muted'),
    signalTextColor: token('fg'),
    noteBkgColor: token('warn-soft'),
    noteBorderColor: token('warn'),
    noteTextColor: token('fg'),
    labelBoxBkgColor: token('surface-2'),
    labelBoxBorderColor: token('border'),
    labelTextColor: token('fg'),
  };
}

let renderCount = 0;

function Legend() {
  const item = (cls: string, label: string, dashed = false) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="28" height="8" aria-hidden className={cls}>
        <line x1="1" y1="4" x2="27" y2="4" strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} stroke="currentColor" />
      </svg>
      {label}
    </span>
  );
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
      {item('text-muted', 'Captured by the Protocol Tap')}
      {item('text-accent', 'QR code or link handed to the wallet')}
      {item('text-bad', 'Answered with an error')}
      {item('text-muted opacity-70', 'Not captured: inferred', true)}
    </p>
  );
}

export function SequenceDiagramView({
  run,
  exchanges,
  catalog,
  selectedId,
  onSelect,
}: {
  run: RunDetail;
  exchanges: ExchangeWithDecoded[];
  catalog: CatalogEntry[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const presents = run.steps.some((s) => s.phase === 'presenting');
  const [view, setView] = useState<SequenceView>(presents ? 'openid4vp' : 'full');
  const [theme] = useTheme();
  const domId = useId().replace(/:/g, '');
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  // Arrows already drawn in this view; newer ones animate in.
  const drawn = useRef<{ view: SequenceView; count: number } | null>(null);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const model: SequenceModel = useMemo(
    () =>
      buildSequence(
        {
          config: run.config,
          exchanges,
          steps: run.steps,
          catalog,
          ...(run.tamper ? { tamper: run.tamper } : {}),
        },
        view,
      ),
    [run.config, run.steps, run.tamper, exchanges, catalog, view],
  );
  const debounced = useDebounced(model, 100);
  const source = useMemo(() => toMermaid(debounced), [debounced]);
  const messages = useMemo(() => sequenceMessages(debounced), [debounced]);

  useEffect(() => {
    if (messages.length === 0) return;
    let live = true;
    setRendering(true);
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: themeVariables(),
        sequence: {
          mirrorActors: false,
          showSequenceNumbers: false,
          // One text element per message, so arrows map to messages by index.
          wrap: false,
          messageFontSize: 12,
          noteFontSize: 12,
          actorFontSize: 13,
          actorMargin: 40,
          // Scale to the panel, so every lane (the Library lane included) is in view.
          useMaxWidth: true,
        },
      });
      const { svg } = await mermaid.render(`seq-${domId}-${++renderCount}`, source);
      if (!live || !container.current) return;
      container.current.innerHTML = svg;
      const previous = drawn.current;
      const animateFrom = previous && previous.view === view ? previous.count : messages.length;
      drawn.current = { view, count: messages.length };
      decorate(container.current, messages, animateFrom, (id) => selectRef.current(id));
      setError(null);
      setRendering(false);
    })().catch((e: unknown) => {
      if (!live) return;
      setError(e instanceof Error ? e.message : String(e));
      setRendering(false);
    });
    return () => {
      live = false;
    };
  }, [source, messages, view, theme, domId]);

  // Highlight the selected message without re-rendering.
  useEffect(() => {
    container.current?.querySelectorAll('[data-exchange-id]').forEach((el) => {
      el.classList.toggle('seq-selected', el.getAttribute('data-exchange-id') === selectedId);
    });
  }, [selectedId, source, rendering]);

  const empty = messages.length === 0;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="sequence-view">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <Tabs label="Sequence view" size="sm" items={VIEWS} value={view} onChange={setView} />
        <div className="flex items-center gap-2">
          {rendering && !empty && <Spinner className="size-3.5" />}
          <CopyButton text={source} label="Copy Mermaid" />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 py-2">
        <Legend />
        {view === 'openid4vp' && (
          <p className="text-[11px] text-muted">
            Verifier ↔ Wallet ↔ Library. The wallet's own library calls never leave the phone or process, so they are drawn
            dashed as inferred.
          </p>
        )}
      </div>
      {empty ? (
        <EmptyState title={view === 'openid4vp' ? 'No presentation yet' : 'No messages yet'}>
          {view === 'openid4vp' && !presents
            ? 'This run does not present the credential. Switch to Full run.'
            : 'Arrows appear here as the protocol tap records messages.'}
        </EmptyState>
      ) : error ? (
        <p className="px-3 py-4 text-xs text-bad">Could not draw the diagram: {error}</p>
      ) : null}
      <div
        ref={container}
        className={cx('seq-diagram min-h-0 flex-1 overflow-auto px-3 pb-4', empty && 'hidden')}
        aria-label={`Message sequence, ${messages.length} arrows`}
        role="group"
      />
    </div>
  );
}

/** Ties each drawn arrow to its message: kind classes, click and keyboard selection, entry animation. */
function decorate(root: HTMLElement, messages: SequenceMessage[], animateFrom: number, onSelect: (id: string) => void) {
  const texts = root.querySelectorAll<SVGTextElement>('text.messageText');
  const lines = root.querySelectorAll<SVGGeometryElement>('.messageLine0, .messageLine1');
  messages.forEach((m, i) => {
    const text = texts[i];
    const line = lines[i];
    if (!text || !line) return;
    const parts: Element[] = [text, line];
    const isNew = i >= animateFrom;
    for (const el of parts) {
      el.classList.add(KIND_CLASS[m.kind]);
      if (m.tampered) el.classList.add('seq-tampered');
      if (isNew) el.classList.add(m.kind === 'inferred' ? 'seq-new-fade' : 'seq-new');
      el.setAttribute('data-message-index', String(i));
    }
    if (!m.exchangeId) {
      text.setAttribute('aria-label', `${m.label} (not captured)`);
      return;
    }
    // A wide transparent copy of the line makes it easy to click.
    const hit = line.cloneNode() as SVGGeometryElement;
    hit.setAttribute('class', 'seq-hit');
    line.after(hit);
    const id = m.exchangeId;
    for (const el of [text, line, hit]) {
      el.setAttribute('data-exchange-id', id);
      el.addEventListener('click', () => onSelect(id));
    }
    text.setAttribute('tabindex', '0');
    text.setAttribute('role', 'button');
    text.setAttribute('aria-label', `${m.label}: show this message`);
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(id);
      }
    });
  });
}
