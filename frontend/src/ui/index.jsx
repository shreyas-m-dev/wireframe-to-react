import React, { useId, useRef } from 'react';

/* Reusable primitives from docs/DESIGN_SYSTEM.md §4. Tokens only — no hex values. */

const BUTTON_VARIANTS = {
  primary: 'bg-accent-bg text-accent-on hover:bg-accent-bg/90 border border-transparent',
  secondary: 'bg-surface-2 text-text border border-border-strong hover:bg-surface-2/70',
  ghost: 'bg-transparent text-text-muted hover:text-text hover:bg-surface-2 border border-transparent',
  danger: 'bg-transparent text-danger border border-danger/60 hover:bg-danger/10',
};
const BUTTON_SIZES = { sm: 'h-8 px-3 text-label gap-1.5', md: 'h-10 px-4 text-label gap-2' };

export function Button({ variant = 'secondary', size = 'md', loading = false, disabled, className = '', children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-fast ease-out
        disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 16, label }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center gap-2">
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="animate-spin motion-reduce:animate-none">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

export function Tile({ title, eyebrow, actions, children, className = '', bodyClassName = '', as: As = 'section' }) {
  const id = useId();
  return (
    <As aria-labelledby={title ? id : undefined} className={`tile ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 pb-3">
          <div className="min-w-0 flex-1 basis-40">
            {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
            {title && <h2 id={id} className="text-title text-text">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">{actions}</div>}
        </header>
      )}
      <div className={`px-4 pb-4 min-h-0 ${bodyClassName}`}>{children}</div>
    </As>
  );
}

export function Field({ label, hint, error, counter, children, id: providedId }) {
  const generated = useId();
  const id = providedId || generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = React.cloneElement(children, {
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
  });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-label text-text">{label}</label>
        {counter && <span className="text-caption normal-case tracking-normal text-text-subtle">{counter}</span>}
      </div>
      {control}
      {hint && <p id={hintId} className="text-caption normal-case tracking-normal text-text-subtle">{hint}</p>}
      {error && <p id={errorId} className="text-caption normal-case tracking-normal text-danger">{error}</p>}
    </div>
  );
}

export const TextInput = React.forwardRef(function TextInput(props, ref) {
  return <input ref={ref} className="input-base h-10" {...props} />;
});

export const TextArea = React.forwardRef(function TextArea(props, ref) {
  return <textarea ref={ref} className="input-base resize-y min-h-[84px]" {...props} />;
});

const ALERT_TONES = {
  info: 'border-accent/40 bg-accent/10',
  success: 'border-success/40 bg-success/10',
  warning: 'border-warning/50 bg-warning/10',
  danger: 'border-danger/50 bg-danger/10',
};
const ALERT_TITLE = { info: 'text-accent', success: 'text-success', warning: 'text-warning', danger: 'text-danger' };

export function Alert({ tone = 'info', title, children, action }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2.5 text-body ${ALERT_TONES[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className={`font-medium ${ALERT_TITLE[tone]}`}>{title}</p>}
          {children && <div className="text-text-muted">{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

const STATUS = {
  queued: { label: 'Queued', tone: 'text-text-muted border-border-strong' },
  running: { label: 'Running', tone: 'text-accent border-accent/60' },
  complete: { label: 'Complete', tone: 'text-success border-success/60' },
  low_fidelity: { label: 'Needs review', tone: 'text-warning border-warning/60' },
  failed: { label: 'Failed', tone: 'text-danger border-danger/60' },
  cancelled: { label: 'Cancelled', tone: 'text-text-subtle border-border-strong' },
};

/** Text + colour, never colour alone. */
export function StatusBadge({ status }) {
  const meta = STATUS[status] || { label: status || 'Unknown', tone: 'text-text-muted border-border-strong' };
  return <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-caption normal-case tracking-normal ${meta.tone}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{meta.label}</span>;
}

/** WAI-ARIA tabs with roving focus (arrow keys, Home/End). */
export function Tabs({ tabs, active, onChange, label }) {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto scroll-thin border-b border-border">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => { refs.current[index] = node; }}
          role="tab"
          type="button"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={`-mb-px border-b-2 px-3 py-2 text-label whitespace-nowrap transition-colors duration-fast
            ${active === tab.id ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, active, children, className = '' }) {
  if (active !== id) return null;
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className={className}>{children}</div>;
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-4">
      {icon && <span aria-hidden="true" className="text-text-subtle">{icon}</span>}
      <p className="text-body font-medium text-text">{title}</p>
      {children && <div className="text-body text-text-muted max-w-sm">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Icon({ path, size = 16, className = '' }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {[].concat(path).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export const ICONS = {
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  theme: ['M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
};
