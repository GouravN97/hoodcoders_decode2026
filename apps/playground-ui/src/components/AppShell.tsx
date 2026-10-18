import { Link, NavLink, Outlet } from 'react-router';
import { USE_MOCKS } from '../config';
import { cx } from './ui';

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-1">
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-accent text-accent-fg" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span>
              Inji Interop Playground
            </span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-[13px]">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cx('rounded-md px-2 py-1', isActive ? 'bg-surface-2 font-medium' : 'text-muted hover:text-fg')
              }
            >
              Playground
            </NavLink>
          </nav>
          {USE_MOCKS && (
            <span
              className="ml-auto rounded-md bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
              title="The API is served by MSW mocks and runs are simulated in the browser"
            >
              Mock data
            </span>
          )}
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
