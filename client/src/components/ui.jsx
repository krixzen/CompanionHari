import { forwardRef } from 'react';

const VARIANTS = {
  primary: 'bg-sage-600 text-white hover:bg-sage-700 focus-visible:outline-sage-600',
  quiet: 'bg-paper-sunk text-ink hover:bg-sage-100 focus-visible:outline-sage-600',
  ghost: 'text-ink-soft hover:bg-paper-sunk hover:text-ink focus-visible:outline-sage-600',
  danger: 'bg-amber-100 text-amber-900 hover:bg-amber-200 focus-visible:outline-amber-600',
};

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Button = forwardRef(function Button(
  { variant = 'quiet', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
});

export function Card({ className = '', ...props }) {
  return <div className={`rounded-xl2 bg-paper-raised shadow-soft ${className}`} {...props} />;
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-amber-800">{error}</span>}
    </label>
  );
}

const controlClasses =
  'w-full rounded-xl border border-black/10 bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200 disabled:bg-paper-sunk';

export const TextInput = forwardRef(function TextInput({ className = '', ...props }, ref) {
  return <input ref={ref} className={`${controlClasses} ${className}`} {...props} />;
});

export const TextArea = forwardRef(function TextArea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`${controlClasses} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`${controlClasses} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
});

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl2 border border-dashed border-black/10 px-6 py-12 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-ink-faint">
      <span className="h-3 w-3 animate-pulse rounded-full bg-sage-400" aria-hidden="true" />
      {label}
    </p>
  );
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="rounded-xl2 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>{children}</p>
      {onRetry && (
        <Button size="sm" variant="danger" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
