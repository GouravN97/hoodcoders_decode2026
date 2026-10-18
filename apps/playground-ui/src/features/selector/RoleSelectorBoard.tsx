import { ROLES, roleLabel, type CatalogEntry, type Role } from '@playground/shared';
import { useEffect } from 'react';
import { Card, EmptyState } from '../../components/ui';
import { selectedIdFor, useSelection } from '../../store/selection';
import { disabledReason } from './compat';
import { ImplementationCard } from './ImplementationCard';

const ROLE_HINT: Record<Role, string> = {
  issuer: 'Creates and signs the credential',
  wallet: 'Holds the credential and presents it',
  verifier: 'Checks the presented credential',
};

export function RoleSelectorBoard({ catalog }: { catalog: CatalogEntry[] }) {
  const selection = useSelection();
  const selectedEntry = (role: Role) => catalog.find((c) => c.id === selectedIdFor(selection, role) && c.role === role);

  // Default each role to its first usable implementation, and drop selections that vanished from the catalog.
  useEffect(() => {
    for (const role of ROLES) {
      const current = catalog.find((c) => c.id === selectedIdFor(selection, role) && c.role === role);
      if (current) continue;
      const others = ROLES.filter((r) => r !== role).map((r) => catalog.find((c) => c.id === selectedIdFor(selection, r)));
      const first = catalog.find((c) => c.role === role && !disabledReason(c, others));
      if (first) selection.select(role, first.id);
    }
  }, [catalog, selection]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3" role="group" aria-label="Choose an implementation for each role">
      {ROLES.map((role) => {
        const entries = catalog.filter((c) => c.role === role);
        const others = ROLES.filter((r) => r !== role).map(selectedEntry);
        return (
          <Card key={role} as="div" className="flex flex-col">
            <fieldset className="flex flex-1 flex-col">
              <legend className="w-full border-b border-border px-4 py-2.5">
                <span className="block text-[13px] font-semibold">{roleLabel(role)}</span>
                <span className="block text-xs text-muted">{ROLE_HINT[role]}</span>
              </legend>
              <div className="flex flex-col gap-2 p-3">
                {entries.length === 0 ? (
                  <EmptyState title="Nothing in the catalog">Add a YAML file to catalog/ with role: {role}.</EmptyState>
                ) : (
                  entries.map((entry) => (
                    <ImplementationCard
                      key={entry.id}
                      entry={entry}
                      selected={selectedIdFor(selection, role) === entry.id}
                      disabledReason={disabledReason(entry, others)}
                      onSelect={() => selection.select(role, entry.id)}
                    />
                  ))
                )}
              </div>
            </fieldset>
          </Card>
        );
      })}
    </div>
  );
}
