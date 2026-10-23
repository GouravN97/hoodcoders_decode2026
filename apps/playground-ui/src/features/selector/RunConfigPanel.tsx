import {
  flowLabel,
  formatLabel,
  modeLabel,
  outcomeLabel,
  runUsesRole,
  SUPPORTED_RUN_MODES,
  type CatalogEntry,
  type CredentialConfigurationSummary,
  type CredentialFormat,
  type PresentationFlow,
  type RunMode,
  type VerificationOutcome,
} from '@playground/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useHeldCredentials } from '../../api/queries';
import { Card, cx, Field, SectionTitle, selectClass } from '../../components/ui';
import { useSelection } from '../../store/selection';

const MODE_HINT: Record<RunMode, string> = {
  full: 'Issue a credential, hold it, present it and verify it in one run.',
  'issue-only': 'Issue a credential into the wallet and stop. The verifier is not contacted.',
  'present-only':
    'Present a credential the wallet already holds from an earlier run. The issuer is not contacted.',
  'direct-verify': 'Send a credential straight to the verifier.',
};

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

/** present-only: which credential the wallet presents, for wallets the playground can look into. */
function HeldCredentialField({
  wallet,
  format,
  credentialConfigurationId,
}: {
  wallet: CatalogEntry | undefined;
  format: CredentialFormat | undefined;
  credentialConfigurationId: string | undefined;
}) {
  const { heldCredentialId, update } = useSelection();
  const held = useHeldCredentials(wallet?.id, true);
  const matching = useMemo(
    () =>
      (held.data?.credentials ?? []).filter(
        (c) => c.format === format && c.credentialConfigurationId === credentialConfigurationId,
      ),
    [held.data, format, credentialConfigurationId],
  );

  // Drop a pick that no longer matches the format, credential or wallet.
  useEffect(() => {
    if (heldCredentialId && held.data && !matching.some((c) => c.id === heldCredentialId))
      update({ heldCredentialId: undefined });
  }, [heldCredentialId, held.data, matching, update]);

  if (!wallet) return null;
  if (held.data && !held.data.listable) {
    return (
      <Field label="Credential in the wallet">
        <p className="text-[13px] text-muted">
          Make sure {wallet.displayName} already holds this credential. You confirm it on the run screen before
          the presentation request is sent.
        </p>
      </Field>
    );
  }
  return (
    <Field
      label="Credential in the wallet"
      htmlFor="held-credential"
      hint={
        held.isError
          ? held.error.message
          : held.data && matching.length === 0
            ? `${wallet.displayName} holds no matching credential. Run an issue-only or full run first.`
            : undefined
      }
    >
      <select
        id="held-credential"
        className={selectClass}
        value={heldCredentialId ?? ''}
        disabled={held.isLoading || matching.length === 0}
        onChange={(e) => update({ heldCredentialId: e.target.value || undefined })}
      >
        {held.isLoading ? (
          <option value="">Loading…</option>
        ) : (
          <option value="">{matching.length > 0 ? 'Newest matching credential' : 'None held'}</option>
        )}
        {matching.map((c) => (
          <option key={c.id} value={c.id}>
            Received {new Date(c.receivedAt).toLocaleString()} · {c.id.slice(0, 8)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function RunConfigPanel({
  formats,
  flows,
  credentialConfigs,
  configsLoading,
  issuer,
  wallet,
}: {
  formats: CredentialFormat[];
  flows: PresentationFlow[];
  credentialConfigs: CredentialConfigurationSummary[];
  configsLoading: boolean;
  issuer: CatalogEntry | undefined;
  wallet: CatalogEntry | undefined;
}) {
  const { mode, format, credentialConfigurationId, presentationFlow, expectedOutcome, update } = useSelection();
  const presenting = runUsesRole(mode, 'verifier');
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
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 2xl:grid-cols-1">
        <Field label="What to run" hint={MODE_HINT[mode]}>
          <Segmented
            name="What to run"
            options={[...SUPPORTED_RUN_MODES]}
            value={mode}
            onChange={(m) => update({ mode: m })}
            render={modeLabel}
          />
        </Field>

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
            {!configsLoading && configsForFormat.length === 0 && (
              <option value="">{issuer ? 'No credential for this format' : 'Choose an issuer first'}</option>
            )}
            {configsForFormat.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </Field>

        {mode === 'present-only' && (
          <HeldCredentialField wallet={wallet} format={format} credentialConfigurationId={credentialConfigurationId} />
        )}

        {presenting && (
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
        )}

        {presenting && (
          <Field label="Expected result" hint={expectedHint}>
            <Segmented
              name="Expected result"
              options={EXPECTED.map((e) => e.value)}
              value={expectedOutcome}
              onChange={(v) => update({ expectedOutcome: v })}
              render={outcomeLabel}
            />
          </Field>
        )}
      </div>
    </Card>
  );
}
