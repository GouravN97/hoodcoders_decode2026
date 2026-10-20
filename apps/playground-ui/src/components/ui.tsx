// Small presentational primitives shared by every feature.
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export type Tone = 'neutral' | 'accent' | 'ok' | 'bad' | 'warn';

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
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
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        mono && 'font-mono',
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

// cx does not merge conflicting utilities, so border colour and shadow are props rather than className overrides.
// glow lights the card up in the accent colour (border, outer glow and a soft wash) and implies highlight.
export function Card({
  children,
  className,
  highlight,
  glow,
  as: As = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
  glow?: boolean;
  as?: 'section' | 'div' | 'article';
  id?: string;
  'aria-label'?: string;
  'data-active'?: boolean;
}) {
  return (
    <As
      className={cx(
        'rounded-xl border bg-surface transition-[border-color,box-shadow,background-color] duration-300 ease-out',
        glow
          ? 'border-accent/70 bg-gradient-to-b from-accent-soft/80 to-surface shadow-[0_0_0_1px_rgb(203_60_255/0.25),0_0_32px_-8px_var(--c-accent)]'
          : cx('shadow-[0_1px_3px_rgb(4_2_20/0.45)]', highlight ? 'border-accent/50' : 'border-border'),
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
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 pb-1 pt-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        {icon && <span className="text-muted">{icon}</span>}
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Page title row: heading and description on the left, page actions on the right. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="max-w-2xl text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** KPI tile: small icon + label, a large value with an optional chip beside it, and a footnote. */
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
    <Card as="div" className="flex min-w-0 flex-col gap-2.5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        {chip}
      </div>
      {footer && <div className="truncate text-xs text-muted">{footer}</div>}
    </Card>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-accent-fg shadow-[0_0_16px_-4px_var(--c-accent)] hover:brightness-110 disabled:opacity-50 disabled:shadow-none',
  secondary: 'border border-border bg-surface-2 hover:border-muted/50 disabled:opacity-50',
  ghost: 'hover:bg-surface-2 text-muted hover:text-fg disabled:opacity-50',
  danger: 'border border-border bg-surface-2 text-bad hover:bg-bad-soft disabled:opacity-50',
};

type ButtonSize = 'sm' | 'md' | 'lg';

/** Button styling for elements that must stay links (<a>, <Link>) but look and press like a Button. */
export function buttonClass({ variant = 'secondary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(
    // Press scales to 0.96 over 150ms; not-disabled (not enabled) so links press too.
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[filter,background-color,color,scale] duration-150 ease-out [-webkit-tap-highlight-color:transparent] motion-safe:not-disabled:active:scale-[0.96] disabled:cursor-not-allowed',
    size === 'sm' && 'h-7 px-2.5 text-xs',
    size === 'md' && 'h-9 px-3.5 text-sm',
    size === 'lg' && 'h-11 px-5 text-[15px]',
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
    <div role="tablist" aria-label={label} className="inline-flex gap-0.5 rounded-lg border border-border bg-bg p-0.5">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'rounded-md font-medium transition-colors',
            size === 'md' ? 'px-3 py-1 text-[13px]' : 'px-2 py-0.5 text-xs',
            value === t.id ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg',
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
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-bad">
      <strong className="font-semibold">{title}.</strong> {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Field({ label, children, htmlFor, hint }: { label: string; children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export const selectClass =
  'h-9 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm hover:border-muted/50 disabled:opacity-50';
