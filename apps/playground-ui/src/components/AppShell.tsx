import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BFF_URL, USE_MOCKS } from '../config';
import { useRecentRuns } from '../store/recentRuns';
import { ClockIcon, GridIcon, MenuIcon, XIcon } from './icons';
import { ThemeSwitch } from './ThemeSwitch';
import { cx } from './ui';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-[15px] font-medium tracking-tight dashdark:font-semibold">
      <span
        className="grid size-8 place-items-center rounded-xl bg-accent text-accent-fg dashdark:size-7 dashdark:rounded-lg dashdark:bg-gradient-to-br dashdark:from-accent dashdark:to-violet dashdark:text-white dashdark:shadow-[0_0_14px_-3px_var(--c-accent)]"
        aria-hidden
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="leading-tight">
        Inji Interop
        <span className="block text-[11px] font-medium text-muted">Playground</span>
      </span>
    </Link>
  );
}

function RecentRuns() {
  const runs = useRecentRuns((s) => s.runs);
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-medium text-muted">
        <ClockIcon width={16} height={16} />
        Recent runs
      </p>
      {runs.length === 0 ? (
        <p className="ml-[1.3rem] border-l border-border py-1 pl-4 text-xs text-muted">Runs you start appear here.</p>
      ) : (
        <ul className="ml-[1.3rem] flex flex-col border-l border-border">
          {runs.map((r) => (
            <li key={r.id}>
              <NavLink
                to={`/runs/${r.id}`}
                title={r.title}
                className={({ isActive }) =>
                  cx(
                    '-ml-px flex flex-col border-l-2 py-1.5 pl-4 pr-2 text-[13px] transition-colors',
                    isActive
                      ? 'border-l-accent bg-gradient-to-r from-accent-soft to-transparent font-medium text-fg'
                      : 'border-l-transparent text-muted hover:text-fg',
                  )
                }
              >
                <span className="truncate">{r.wallet}</span>
                <span className="truncate text-[11px] text-muted">
                  {r.formatLabel} · {new Date(r.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="px-1">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cx(
              'flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors dashdark:rounded-lg dashdark:px-3',
              isActive
                ? 'bg-accent-soft text-fg dashdark:bg-surface dashdark:text-accent'
                : 'text-muted hover:bg-surface-2 hover:text-fg dashdark:hover:bg-transparent',
            )
          }
        >
          <GridIcon width={16} height={16} />
          New run
        </NavLink>
        <RecentRuns />
      </nav>
      <ThemeSwitch />
      <div
        className="flex items-center gap-3 border-t border-border px-1 pt-4"
        title={USE_MOCKS ? 'The API is served by MSW mocks and runs are simulated in the browser' : undefined}
      >
        <span
          aria-hidden
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
            USE_MOCKS ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok',
          )}
        >
          {USE_MOCKS ? 'M' : 'API'}
        </span>
        <div className="min-w-0 text-[13px] leading-tight">
          <p className="font-medium">{USE_MOCKS ? 'Mock data' : 'Live backend'}</p>
          <p className="truncate text-xs text-muted">{USE_MOCKS ? 'Simulated in this browser' : BFF_URL || 'Same-origin BFF'}</p>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-1">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface lg:block dashdark:bg-bg">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-muted hover:text-fg"
        >
          <MenuIcon width={18} height={18} />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-fg/30 dashdark:bg-black/60" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-surface dashdark:bg-bg transition-[translate] duration-200 ease-out motion-safe:starting:-translate-x-full">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
            >
              <XIcon width={16} height={16} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      <main id="main" className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
