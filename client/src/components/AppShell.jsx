import { NavLink, Link } from 'react-router-dom';

const linkClasses = ({ isActive }) =>
  `rounded-full px-2.5 py-1.5 text-sm font-medium transition sm:px-3 ${
    isActive ? 'bg-sage-100 text-sage-800' : 'text-ink-soft hover:bg-paper-sunk hover:text-ink'
  }`;

export function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-ink">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-sage-500" />
            {/* Four nav items leave no room for the wordmark on a phone. */}
            <span className="hidden whitespace-nowrap text-sm font-semibold tracking-tight xs:inline">
              Study Planner
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClasses}>
              Home
            </NavLink>
            <NavLink to="/planner" className={linkClasses}>
              Week
            </NavLink>
            <NavLink to="/subjects" className={linkClasses}>
              Subjects
            </NavLink>
            <NavLink to="/tests" className={linkClasses}>
              Tests
            </NavLink>
            <NavLink to="/progress" className={linkClasses}>
              Progress
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-ink-faint sm:px-6">
        Everything here stays on this computer.
      </footer>
    </div>
  );
}

/** A page heading with an optional back link and a slot for actions. */
export function PageHeader({ eyebrow, title, description, actions, backTo, backLabel }) {
  return (
    <div className="mb-6">
      {backTo && (
        <Link
          to={backTo}
          className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft transition hover:text-ink"
        >
          <span aria-hidden="true">←</span> {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-sage-600">{eyebrow}</p>
          )}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
