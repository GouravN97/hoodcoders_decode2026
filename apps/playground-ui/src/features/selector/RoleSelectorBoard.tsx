import { ROLES, roleLabel, type CatalogEntry, type Role } from '@playground/shared';
import { useEffect } from 'react';
import { IssuerIcon, ShieldIcon, WalletIcon } from '../../components/icons';
import { Card, cx, EmptyState, selectClass } from '../../components/ui';
import { selectedIdFor, useSelection } from '../../store/selection';
import { disabledReason } from './compat';
import { ImplementationCard } from './ImplementationCard';

const ROLE_META: Record<Role, { hint: string; Icon: typeof IssuerIcon }> = {
  issuer: { hint: 'Creates and signs the credential', Icon: IssuerIcon },
  wallet: { hint: 'Holds the credential and presents it', Icon: WalletIcon },
  verifier: { hint: 'Checks the presented credential', Icon: ShieldIcon },
};

export function RoleSelectorBoard({ catalog }: { catalog: CatalogEntry[] }) {
  const selection = useSelection();
  const selectedEntry = (role: Role) => catalog.find((c) => c.id === selectedIdFor(selection, role) && c.role === role);

  // Every role starts at None; a selection that vanished from the catalog goes back to None.
  useEffect(() => {
    for (const role of ROLES) {
      const id = selectedIdFor(selection, role);
      if (id && !catalog.some((c) => c.id === id && c.role === role)) selection.select(role, undefined);
    }
  }, [catalog, selection]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3" role="group" aria-label="Choose an implementation for each role">
      {ROLES.map((role) => {
        const entries = catalog.filter((c) => c.role === role);
        const others = ROLES.filter((r) => r !== role).map(selectedEntry);
        const reasons = new Map(entries.map((e) => [e.id, disabledReason(e, others)]));
        const unavailable = entries.filter((e) => reasons.get(e.id));
        const current = selectedEntry(role);
        const id = `role-${role}`;
        const { hint, Icon } = ROLE_META[role];
        // The panel lights up once a service is chosen for its role.
        return (
          <Card key={role} as="div" className="flex flex-col" glow={Boolean(current)} data-active={Boolean(current)}>
            <div className="flex items-center gap-3 px-4 pb-1 pt-3.5">
              <span
                aria-hidden
                data-testid={`role-icon-${role}`}
                className={cx(
                  'grid size-9 shrink-0 place-items-center rounded-lg border transition-[background-color,border-color,color,box-shadow] duration-300 ease-out',
                  current
                    ? 'border-transparent bg-gradient-to-br from-accent to-violet text-white shadow-[0_0_16px_-3px_var(--c-accent)]'
                    : 'border-border bg-surface-2 text-muted',
                )}
              >
                <Icon width={18} height={18} />
              </span>
              <div className="min-w-0">
                <label htmlFor={id} className="block text-sm font-semibold">
                  {roleLabel(role)}
                </label>
                <span className="block text-xs text-muted">{hint}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {entries.length === 0 ? (
                <EmptyState title="Nothing in the catalog">Add a YAML file to catalog/ with role: {role}.</EmptyState>
              ) : (
                <>
                  <select
                    id={id}
                    className={selectClass}
                    value={current?.id ?? ''}
                    onChange={(e) => selection.select(role, e.target.value || undefined)}
                  >
                    <option value="">None</option>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id} disabled={Boolean(reasons.get(entry.id))}>
                        {entry.displayName}
                        {reasons.get(entry.id) ? ' (unavailable)' : ''}
                      </option>
                    ))}
                  </select>
                  {current ? (
                    <ImplementationCard entry={current} problem={reasons.get(current.id)} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                      No {roleLabel(role).toLowerCase()} selected
                    </p>
                  )}
                  {unavailable.length > 0 && (
                    <ul className="flex flex-col gap-0.5 text-[11px] text-muted" aria-label={`Unavailable ${roleLabel(role).toLowerCase()}s`}>
                      {unavailable.map((e) => (
                        <li key={e.id}>{reasons.get(e.id)}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
