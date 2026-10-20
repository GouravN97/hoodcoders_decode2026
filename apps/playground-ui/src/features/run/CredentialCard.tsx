import { formatLabel, type Artifact } from '@playground/shared';
import { useMemo } from 'react';
import { Badge, Card, SectionTitle } from '../../components/ui';
import { humanizeClaim, summarizeCredential } from '../../lib/credential';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function CredentialCard({ artifact }: { artifact: Artifact }) {
  const summary = useMemo(() => summarizeCredential(artifact.raw), [artifact.raw]);
  const expired = summary.validUntil ? new Date(summary.validUntil).getTime() < Date.now() : false;

  return (
    <Card aria-label="Issued credential">
      <SectionTitle aside={artifact.format && <Badge mono>{artifact.format}</Badge>}>Issued credential</SectionTitle>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-lg bg-gradient-to-br from-accent-strong to-violet p-4 text-accent-fg">
          <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">
            {artifact.format ? formatLabel(artifact.format) : 'Credential'}
          </p>
          <p className="mt-0.5 text-base font-semibold">{summary.type ?? 'Verifiable credential'}</p>
          <p className="mt-2 break-all font-mono text-[11px] opacity-80">{summary.issuer ?? 'Unknown issuer'}</p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
          {summary.claims.map((c) => (
            <div key={c.name} className="contents">
              <dt className="text-muted">{humanizeClaim(c.name)}</dt>
              <dd className="break-words">{c.value}</dd>
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
          <dt className="text-muted">Valid from</dt>
          <dd>{fmtDate(summary.validFrom)}</dd>
          <dt className="text-muted">Valid until</dt>
          <dd className={expired ? 'font-medium text-warn' : undefined}>
            {fmtDate(summary.validUntil)} {expired && '(expired)'}
          </dd>
          <dt className="text-muted">Proof</dt>
          <dd className="font-mono">{summary.proofType ?? '—'}</dd>
        </dl>
      </div>
    </Card>
  );
}
