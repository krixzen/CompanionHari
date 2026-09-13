import { useEffect, useState } from 'react';

export default function HomePage() {
  const [health, setHealth] = useState({ state: 'checking' });

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth({ state: 'ok', data }))
      .catch(() => setHealth({ state: 'error' }));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-sage-600">Study Planner</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        The workshop is set up.
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">
        Nothing to study just yet — this is the empty project skeleton. Subjects, syllabus
        import and topic planning arrive in the next phase.
      </p>

      <div className="mt-10 rounded-xl2 bg-paper-raised p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Backend connection</h2>
        {health.state === 'checking' && (
          <p className="mt-1 text-sm text-ink-faint">Checking…</p>
        )}
        {health.state === 'ok' && (
          <p className="mt-1 text-sm text-sage-600">
            Connected. Database: {health.data.database}
          </p>
        )}
        {health.state === 'error' && (
          <p className="mt-1 text-sm text-amber-700">
            Could not reach the backend. Is <code className="font-mono">npm run dev</code> running?
          </p>
        )}
      </div>
    </main>
  );
}
