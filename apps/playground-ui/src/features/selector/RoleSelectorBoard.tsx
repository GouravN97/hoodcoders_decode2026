import { ROLES, roleLabel, type CatalogEntry, type Role } from '@playground/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, IssuerIcon, ShieldIcon, WalletIcon } from '../../components/icons';
import { Button, Card, cx, EmptyState } from '../../components/ui';
import { selectedIdFor, useSelection } from '../../store/selection';
import { disabledReason } from './compat';
import { ImplementationCard } from './ImplementationCard';

const ROLE_META: Record<Role, { hint: string; Icon: typeof IssuerIcon }> = {
  issuer: { hint: 'Creates and signs the credential', Icon: IssuerIcon },
  wallet: { hint: 'Holds the credential and presents it', Icon: WalletIcon },
  verifier: { hint: 'Checks the presented credential', Icon: ShieldIcon },
};

/** Tracks whether a horizontal scroller can move left or right, for its arrow buttons. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    ro?.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [update]);
  const scroll = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return { ref, edges, scroll };
}

function RoleRow({ role, catalog, others }: { role: Role; catalog: CatalogEntry[]; others: Array<CatalogEntry | undefined> }) {
  const selection = useSelection();
  const entries = catalog.filter((c) => c.role === role);
  const current = entries.find((c) => c.id === selectedIdFor(selection, role));
  const { hint, Icon } = ROLE_META[role];
  const { ref, edges, scroll } = useScrollEdges();
  const label = roleLabel(role);
  const headingId = `role-${role}-heading`;

  // Recessed while the role is None, highlighted once a service is chosen (see Card's dim and active);
  // hover lifts a recessed row and sweeps a shimmer across.
  return (
    <Card as="div" active={Boolean(current)} dim={!current} data-active={Boolean(current)} className="shimmer">
      {/* min-w-0: a fieldset otherwise refuses to shrink below its content, and the row would clip instead of scroll. */}
      <fieldset aria-labelledby={headingId} className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-5">
          <span
            aria-hidden
            data-testid={`role-icon-${role}`}
            className={cx(
              'grid size-9 shrink-0 place-items-center rounded-lg border transition-[background-color,border-color,color] duration-300 ease-out',
              current
                ? 'border-transparent bg-accent text-accent-fg dashdark:bg-gradient-to-br dashdark:from-accent dashdark:to-violet dashdark:text-white'
                : 'border-border bg-surface text-muted dashdark:bg-surface-2',
            )}
          >
            <Icon width={18} height={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-base font-medium leading-tight dashdark:font-semibold">
              {label}
            </h3>
            <p className="text-xs text-muted">
              {hint} · {current ? <span className="font-medium text-fg">{current.displayName}</span> : 'none chosen'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {current && (
              <Button size="sm" variant="ghost" onClick={() => selection.select(role, undefined)} aria-label={`Clear ${label.toLowerCase()}`}>
                Clear
              </Button>
            )}
            {(edges.left || edges.right) && (
              <>
                <Button size="sm" variant="secondary" className="w-8 px-0 dashdark:w-7" onClick={() => scroll(-1)} disabled={!edges.left} aria-label={`Show earlier ${label.toLowerCase()}s`}>
                  <ChevronLeftIcon width={16} height={16} className="shrink-0" />
                </Button>
                <Button size="sm" variant="secondary" className="w-8 px-0 dashdark:w-7" onClick={() => scroll(1)} disabled={!edges.right} aria-label={`Show more ${label.toLowerCase()}s`}>
                  <ChevronRightIcon width={16} height={16} className="shrink-0" />
                </Button>
              </>
            )}
          </div>
        </div>
        {entries.length === 0 ? (
          <EmptyState title="Nothing in the catalog">Add a YAML file to catalog/ with role: {role}.</EmptyState>
        ) : (
          <div
            ref={ref}
            className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 pt-2 [scrollbar-width:thin] sm:scroll-px-5 sm:px-5"
          >
            {entries.map((entry) => (
              <ImplementationCard
                key={entry.id}
                entry={entry}
                selected={current?.id === entry.id}
                disabledReason={disabledReason(entry, others)}
                onSelect={() => selection.select(role, entry.id)}
              />
            ))}
          </div>
        )}
      </fieldset>
    </Card>
  );
}

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
    <div className="flex min-w-0 flex-col gap-4" role="group" aria-label="Choose an implementation for each role">
      {ROLES.map((role) => (
        <RoleRow key={role} role={role} catalog={catalog} others={ROLES.filter((r) => r !== role).map(selectedEntry)} />
      ))}
    </div>
  );
}
