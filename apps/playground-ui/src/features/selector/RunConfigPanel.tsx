import {
  flowLabel,
  formatLabel,
  outcomeLabel,
  type CatalogEntry,
  type CredentialConfigurationSummary,
  type CredentialFormat,
  type PresentationFlow,
  type VerificationOutcome,
} from '@playground/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Card, cx, Field, SectionTitle, selectClass } from '../../components/ui';
import { useSelection } from '../../store/selection';

const EXPECTED: Array<{ value: VerificationOutcome; hint: string }> = [
  { value: 'VALID', hint: 'A normal credential straight from the issuer.' },
  { value: 'INVALID', hint: 'The credential is altered after signing, so its proof no longer matches.' },
  { value: 'EXPIRED', hint: 'The credential is genuinely signed, but its validity window has closed.' },
];

function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
  render,
}: {
  name: string;
  options: T[];
  value: T | undefined;
  onChange: (v: T) => void;
  render: (v: T) => ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label
          key={o}
          className={cx(
            'cursor-pointer rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors',
            value === o ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-border hover:bg-surface-2',
          )}
        >
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" />
          {render(o)}
        </label>
      ))}
    </div>
  );
}

export function RunConfigPanel({
  formats,
  flows,
  credentialConfigs,
  configsLoading,
  issuer,
}: {
  formats: CredentialFormat[];
  flows: PresentationFlow[];
  credentialConfigs: CredentialConfigurationSummary[];
  configsLoading: boolean;
  issuer: CatalogEntry | undefined;
}) {
  const { format, credentialConfigurationId, presentationFlow, expectedOutcome, update } = useSelection();
  const configsForFormat = useMemo(
    () => credentialConfigs.filter((c) => c.format === format),
    [credentialConfigs, format],
  );

  // Keep dependent choices valid when the role selection changes.
  useEffect(() => {
    if (formats.length > 0 && (!format || !formats.includes(format))) update({ format: formats[0] });
  }, [formats, format, update]);
  useEffect(() => {
    if (configsForFormat.length > 0 && !configsForFormat.some((c) => c.id === credentialConfigurationId)) {
      update({ credentialConfigurationId: configsForFormat[0]!.id });
    }
  }, [configsForFormat, credentialConfigurationId, update]);
  useEffect(() => {
    if (flows.length > 0 && !flows.includes(presentationFlow)) update({ presentationFlow: flows[0]! });
  }, [flows, presentationFlow, update]);

  const expectedHint = EXPECTED.find((e) => e.value === expectedOutcome)?.hint;

  return (
    <Card aria-label="Run settings">
      <SectionTitle>Run settings</SectionTitle>
      <div className="flex flex-col gap-4 p-4">
        <Field label="Credential format">
          {formats.length === 0 ? (
            <p className="text-[13px] text-bad">The selected issuer, wallet and verifier share no format.</p>
          ) : (
            <Segmented
              name="Credential format"
              options={formats}
              value={format}
              onChange={(f) => update({ format: f })}
              render={(f) => (
                <span className="flex flex-col leading-tight">
                  <span>{formatLabel(f)}</span>
                  <span className="font-mono text-[11px] opacity-75">{f}</span>
                </span>
              )}
            />
          )}
        </Field>

        <Field
          label="Credential"
          htmlFor="credential-config"
          hint={issuer ? `From ${issuer.displayName}'s issuer metadata` : undefined}
        >
          <select
            id="credential-config"
            className={selectClass}
            value={credentialConfigurationId ?? ''}
            disabled={configsLoading || configsForFormat.length === 0}
            onChange={(e) => update({ credentialConfigurationId: e.target.value })}
          >
            {configsLoading && <option value="">Loading…</option>}
            {!configsLoading && configsForFormat.length === 0 && <option value="">No credential for this format</option>}
            {configsForFormat.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How to present" htmlFor="presentation-flow">
          <select
            id="presentation-flow"
            className={selectClass}
            value={presentationFlow}
            onChange={(e) => update({ presentationFlow: e.target.value as PresentationFlow })}
          >
            {flows.map((f) => (
              <option key={f} value={f}>
                {flowLabel(f)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Expected result" hint={expectedHint}>
          <Segmented
            name="Expected result"
            options={EXPECTED.map((e) => e.value)}
            value={expectedOutcome}
            onChange={(v) => update({ expectedOutcome: v })}
            render={outcomeLabel}
          />
        </Field>
      </div>
    </Card>
  );
}
