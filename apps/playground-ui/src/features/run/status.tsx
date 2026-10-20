// Visual vocabulary for step and phase status, shared by the stepper and the report.
import type { EvidenceKind, RunStep, StepStatus } from '@playground/shared';
import { AlertIcon, CheckIcon, ClockIcon, DashIcon, HandIcon, PlugIcon, TapIcon, XIcon } from '../../components/icons';
import { cx, Spinner } from '../../components/ui';

export const STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'Waiting',
  active: 'In progress',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
  inconclusive: 'Inconclusive',
};

export function StatusIcon({ status, className }: { status: StepStatus; className?: string }) {
  const ring = 'grid size-5 shrink-0 place-items-center rounded-full';
  switch (status) {
    case 'done':
      return <span className={cx(ring, 'bg-ok text-surface', className)}><CheckIcon width={12} height={12} strokeWidth={1.5} /></span>;
    case 'failed':
      return <span className={cx(ring, 'bg-bad text-surface', className)}><XIcon width={12} height={12} strokeWidth={1.5} /></span>;
    case 'inconclusive':
      return <span className={cx(ring, 'bg-warn text-surface', className)}><AlertIcon width={12} height={12} strokeWidth={1.5} /></span>;
    case 'active':
      return <span className={cx(ring, 'bg-accent-soft text-accent', className)}><Spinner className="size-3.5" /></span>;
    case 'skipped':
      return <span className={cx(ring, 'border border-border text-muted', className)}><DashIcon width={12} height={12} strokeWidth={1.5} /></span>;
    case 'pending':
      return <span className={cx(ring, 'border border-dashed border-border text-muted', className)}><ClockIcon width={11} height={11} strokeWidth={1.5} /></span>;
  }
}

const EVIDENCE: Record<EvidenceKind, { label: string; Icon: typeof TapIcon }> = {
  tap: { label: 'Seen by the protocol tap', Icon: TapIcon },
  adapter: { label: 'Reported by the adapter', Icon: PlugIcon },
  manual: { label: 'Confirmed by a person', Icon: HandIcon },
};

export function EvidenceIcon({ kind }: { kind: EvidenceKind }) {
  const { label, Icon } = EVIDENCE[kind];
  return (
    <span title={label} className="inline-flex text-muted">
      <Icon width={13} height={13} strokeWidth={1.5} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function phaseStatus(steps: RunStep[]): StepStatus {
  if (steps.some((s) => s.status === 'failed')) return 'failed';
  if (steps.some((s) => s.status === 'inconclusive')) return 'inconclusive';
  if (steps.length > 0 && steps.every((s) => s.status === 'done')) return 'done';
  if (steps.some((s) => s.status === 'active' || s.status === 'done')) return 'active';
  if (steps.length > 0 && steps.every((s) => s.status === 'skipped')) return 'skipped';
  return 'pending';
}
