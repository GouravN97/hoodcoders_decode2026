// Small presentational primitives shared by every feature. Classes are the Noble theme; dashdark: variants
// restore the Dashdark shapes (src/index.css, src/theme.ts).
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export type Tone = 'neutral' | 'accent' | 'ok' | 'bad' | 'warn';

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-surface text-fg border-border dashdark:bg-surface-2 dashdark:text-muted',
  accent: 'bg-accent-soft text-accent border-accent/25',
  ok: 'bg-ok-soft text-ok border-ok/25',
  bad: 'bg-bad-soft text-bad border-bad/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
};

export function Badge({ tone = 'neutral', children, title, mono }: { tone?: Tone; children: ReactNode; title?: string; mono?: boolean }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 dashdark:rounded-[5px] dashdark:px-1.5',
        mono && 'font-mono',
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

// cx does not merge conflicting utilities, so border colour and background are props rather than className overrides.
// active marks a made choice (mint; Dashdark: lighter surface, accent border). dim recedes the card until then
// (page colour; Dashdark: a brightness filter that hover and focus lift).
export function Card({
  children,
  className,
  highlight,
  active,
  dim,
  as: As = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
  active?: boolean;
  dim?: boolean;
  as?: 'section' | 'div' | 'article';
  id?: string;
  'aria-label'?: string;
  'data-active'?: boolean;
}) {
  return (
    <As
      className={cx(
        'rounded-[20px] border transition-[border-color,background-color,filter,opacity] duration-300 ease-out',
        'dashdark:rounded-xl dashdark:shadow-[0_1px_3px_rgb(4_2_20/0.45)]',
        active
          ? 'border-transparent bg-accent-soft dashdark:border-accent/60 dashdark:bg-surface-2'
          : dim
            ? cx(
                'border-border bg-bg hover:bg-surface focus-within:bg-surface',
                'dashdark:bg-surface dashdark:brightness-[0.8] dashdark:saturate-[0.7] dashdark:hover:brightness-95 dashdark:hover:saturate-100',
                'dashdark:focus-within:brightness-100 dashdark:focus-within:saturate-100',
              )
            : cx('bg-surface', highlight ? 'border-accent/40 dashdark:border-accent/50' : 'border-border'),
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

export function SectionTitle({ children, aside, icon }: { children: ReactNode; aside?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-5 pb-1 pt-4 dashdark:min-h-12 dashdark:px-4 dashdark:pt-3">
      <h2 className="flex items-center gap-2 text-lg font-normal tracking-tight dashdark:text-sm dashdark:font-semibold">
        {icon && <span className="dashdark:text-muted">{icon}</span>}
        {children}
      </h2>
      {aside}
    </div>
  );
}

/**
 * Page title: a large light-weight heading with description and actions. hero sets it on a mint panel,
 * like the Noble template's landing hero. Dashdark keeps a compact plain header.
 */
export function PageHeader({
  title,
  description,
  actions,
  hero,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  hero?: boolean;
}) {
  return (
    <header
      className={cx(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between dashdark:gap-3 dashdark:sm:items-start',
        hero && 'rounded-[28px] bg-mint px-6 py-9 sm:px-10 sm:py-12 dashdark:rounded-none dashdark:bg-transparent dashdark:p-0 dashdark:sm:p-0',
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 dashdark:gap-1">
        <h1
          className={cx(
            'font-normal leading-[1.08] tracking-tight dashdark:text-2xl dashdark:font-semibold dashdark:leading-tight dashdark:sm:text-2xl',
            hero ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl',
          )}
        >
          {title}
        </h1>
        {description && <div className="max-w-2xl text-[15px] dashdark:text-sm dashdark:text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * KPI tile: icon, label, a large value with an optional chip, a footnote. Noble: a ruled column after the
 * template's feature columns, icon on top. Dashdark: a card with the icon beside the label.
 */
export function StatCard({
  icon,
  label,
  value,
  chip,
  footer,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  chip?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col gap-3 border-l border-accent py-1 pl-5 sm:pl-6',
        'dashdark:gap-2.5 dashdark:rounded-xl dashdark:border dashdark:border-border dashdark:bg-surface dashdark:p-4 dashdark:sm:pl-4',
        'dashdark:shadow-[0_1px_3px_rgb(4_2_20/0.45)]',
      )}
    >
      <p className="flex flex-col gap-3 text-[13px] text-muted dashdark:flex-row dashdark:items-center dashdark:gap-1.5 dashdark:text-xs dashdark:font-medium">
        {icon && <span className="flex text-fg dashdark:text-muted [&>svg]:size-[22px] dashdark:[&>svg]:size-[15px]">{icon}</span>}
        {label}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 dashdark:gap-x-2">
        <span className="truncate text-3xl font-normal leading-none tracking-tight tabular-nums dashdark:text-2xl dashdark:font-semibold">
          {value}
        </span>
        {chip}
      </div>
      {footer && <div className="truncate text-[13px] text-muted dashdark:text-xs">{footer}</div>}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BUTTON: Record<ButtonVariant, string> = {
  primary: cx(
    'bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-50',
    'dashdark:bg-accent-strong dashdark:shadow-[0_0_16px_-4px_var(--c-accent)] dashdark:hover:bg-accent-strong dashdark:hover:brightness-110 dashdark:disabled:shadow-none',
  ),
  secondary: cx(
    'border border-accent/25 bg-surface hover:bg-accent-soft disabled:opacity-50',
    'dashdark:border-border dashdark:bg-surface-2 dashdark:hover:border-muted/50 dashdark:hover:bg-surface-2',
  ),
  ghost: 'hover:bg-surface-2 text-muted hover:text-fg disabled:opacity-50',
  danger: 'border border-bad/30 bg-surface text-bad hover:bg-bad-soft disabled:opacity-50 dashdark:border-border dashdark:bg-surface-2',
};

type ButtonSize = 'sm' | 'md' | 'lg';

/** Button styling for elements that must stay links (<a>, <Link>) but look and press like a Button. */
export function buttonClass({ variant = 'secondary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(
    // Press scales to 0.96 over 150ms; not-disabled (not enabled) so links press too.
    'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-[filter,background-color,color,scale] duration-150 ease-out [-webkit-tap-highlight-color:transparent] motion-safe:not-disabled:active:scale-[0.96] disabled:cursor-not-allowed dashdark:rounded-lg',
    size === 'sm' && 'h-8 px-3.5 text-xs dashdark:h-7 dashdark:px-2.5',
    size === 'md' && 'h-10 px-5 text-sm dashdark:h-9 dashdark:px-3.5',
    size === 'lg' && 'h-12 px-6 text-[15px] dashdark:h-11 dashdark:px-5',
    BUTTON[variant],
    className,
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type="button" className={buttonClass({ variant, size, className })} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('size-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'md',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-0.5 rounded-full border border-border bg-surface p-0.5 dashdark:rounded-lg dashdark:bg-bg">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'rounded-full font-medium transition-colors dashdark:rounded-md',
            size === 'md' ? 'px-3.5 py-1 text-[13px] dashdark:px-3' : 'px-2.5 py-0.5 text-xs dashdark:px-2',
            value === t.id ? 'bg-accent text-accent-fg dashdark:bg-surface-2 dashdark:text-fg dashdark:shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ title, error }: { title: string; error: unknown }) {
  return (
    <div role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-2.5 text-[13px] text-bad dashdark:rounded-lg dashdark:px-3 dashdark:py-2">
      <strong className="font-semibold">{title}.</strong> {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Field({ label, children, htmlFor, hint }: { label: string; children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-medium dashdark:text-xs dashdark:text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export const selectClass =
  'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm hover:border-accent/40 disabled:opacity-50 dashdark:h-9 dashdark:rounded-lg dashdark:bg-surface-2 dashdark:px-2.5 dashdark:hover:border-muted/50';
