import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, EmptyState, Field, Icon, ICONS, Spinner, StatusBadge, TabPanel, Tabs, TextArea, Tile } from '../ui';
import CodeView from '../CodeView';
import SandboxedPreview from './SandboxedPreview';
import { ACTIVE_STATUSES } from './hooks';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'];
const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const formatTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/* ------------------------------------------------------------------ input */

export function InputTile({ file, onFile, instructions, onInstructions, onGenerate, submitting, error, disabled, limits, genMode }) {
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState(null);
  const maxBytes = limits?.maxUploadBytes || 15 * 1024 * 1024;
  const accept = (candidate) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) { setFileError('Use a PNG, JPEG, WebP or BMP image.'); return; }
    if (candidate.size > maxBytes) { setFileError(`That file is ${formatBytes(candidate.size)}; the limit is ${formatBytes(maxBytes)}.`); return; }
    setFileError(null);
    onFile(candidate);
  };
  return (
    <Tile title="New generation" eyebrow="Input" className="area-input">
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); onGenerate(); }}>
        <label
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); accept(event.dataTransfer.files?.[0]); }}
          className={`flex items-center gap-3 rounded-md border border-dashed px-4 py-4 cursor-pointer transition-colors duration-fast
            ${dragging ? 'border-accent bg-accent/10' : 'border-border-strong bg-surface-2 hover:border-accent'} focus-within:outline focus-within:outline-2 focus-within:outline-accent`}
        >
          <input type="file" className="sr-only" accept={ACCEPTED.join(',')} onChange={(event) => { accept(event.target.files?.[0]); event.target.value = ''; }} />
          <span className="grid place-items-center h-10 w-10 rounded-md bg-accent/15 text-accent shrink-0"><Icon path={ICONS.upload} size={20} /></span>
          <span className="min-w-0">
            <span className="block font-medium text-text truncate">{file ? file.name : 'Choose or drop a wireframe'}</span>
            <span className="block text-caption normal-case tracking-normal text-text-subtle">{file ? formatBytes(file.size) : `PNG, JPEG, WebP or BMP · up to ${formatBytes(maxBytes)}`}</span>
          </span>
        </label>
        {fileError && <Alert tone="danger">{fileError}</Alert>}
        <Field label="Design instructions (optional)" counter={`${instructions.length}/1500`} hint="Style, colour, typography or interactions. The image's structure stays authoritative.">
          <TextArea maxLength={1500} rows={3} value={instructions} onChange={(event) => onInstructions(event.target.value)} placeholder="Clean light theme, rounded blue buttons, responsive layout." />
        </Field>
        {error && <Alert tone="danger" title="Could not start generation">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-caption normal-case tracking-normal text-text-subtle">Mode: {genMode === 'llm' ? 'LLM-assisted' : 'deterministic templates (offline)'}</span>
          <Button type="submit" variant="primary" loading={submitting} disabled={!file || disabled}>Generate React</Button>
        </div>
      </form>
    </Tile>
  );
}

/* --------------------------------------------------------------- progress */

const STAGES = [
  ['preprocess', 'Preprocess', 'Validate and normalise the image'],
  ['detect', 'Detect', 'Find elements and read text (CV + OCR)'],
  ['schema', 'Schema', 'Build the layout tree'],
  ['generate', 'Generate', 'Compile the tree to JSX'],
  ['validate', 'Validate', 'Filter, check structure, compile preview'],
];

function useElapsed(startedAt, running) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!startedAt) return null;
  return Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
}

export function ProgressTile({ job, onCancel, cancelling, error }) {
  const active = job && ACTIVE_STATUSES.has(job.status);
  const elapsed = useElapsed(job?.startedAt, active);
  const currentIndex = job ? STAGES.findIndex(([id]) => id === job.stage) : -1;
  const finished = job && !active;
  return (
    <Tile
      title={job ? (active ? 'Generating…' : 'Last run') : 'Pipeline'}
      eyebrow="Progress"
      className="area-progress"
      actions={job && <><StatusBadge status={job.status} />{active && <Button size="sm" variant="danger" onClick={onCancel} loading={cancelling}>Cancel</Button>}</>}
    >
      {!job && <p className="text-text-muted">Upload a wireframe and press <span className="text-text font-medium">Generate React</span>. Each stage reports here as it runs.</p>}
      {job && (
        <div className="flex flex-col gap-3">
          {active && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div className="progress-indeterminate h-full w-2/5 rounded-full bg-accent" />
            </div>
          )}
          <ol className="grid grid-cols-1 sm:grid-cols-5 gap-2" aria-label="Pipeline stages">
            {STAGES.map(([id, label, description], index) => {
              const done = finished ? job.status !== 'failed' || index < currentIndex || job.stage === 'done' : index < currentIndex;
              const current = active && index === currentIndex;
              const failedHere = job.status === 'failed' && job.stage !== 'done' && index === currentIndex;
              return (
                <li key={id} aria-current={current ? 'step' : undefined}
                  className={`rounded-md border px-3 py-2 ${current ? 'border-accent bg-accent/10' : failedHere ? 'border-danger/60 bg-danger/10' : 'border-border bg-surface-2'}`}>
                  <p className={`text-label ${current ? 'text-accent' : done ? 'text-text' : 'text-text-subtle'}`}>
                    <span aria-hidden="true">{done && !failedHere ? '✓ ' : current ? '● ' : `${index + 1}. `}</span>{label}
                    <span className="sr-only">{current ? ' (in progress)' : done ? ' (done)' : ' (pending)'}</span>
                  </p>
                  <p className="text-caption normal-case tracking-normal text-text-subtle hidden sm:block">{description}</p>
                </li>
              );
            })}
          </ol>
          <p className="text-caption normal-case tracking-normal text-text-subtle" aria-live="polite">
            {active ? (job.status === 'queued' ? 'Waiting for a free worker…' : `Running ${elapsed ?? 0}s`) : `Finished ${formatTime(job.finishedAt)}`}
          </p>
          {job.error && job.status !== 'cancelled' && <Alert tone="danger" title="Generation failed">{job.error.message}</Alert>}
          {error && <Alert tone="warning">Lost contact with the server while following this job. Retrying…</Alert>}
        </div>
      )}
    </Tile>
  );
}

/* ----------------------------------------------------------------- result */

export function ResultTile({ job, result, onExport, exporting, onRegenerate, regenerating, onFullView, canRegenerate }) {
  const [tab, setTab] = useState('preview');
  const tabs = [
    { id: 'preview', label: 'Preview' },
    { id: 'code', label: 'Code' },
    { id: 'schema', label: 'Schema' },
    { id: 'report', label: 'Report' },
  ];
  const schemaJson = useMemo(() => (result?.schema ? JSON.stringify(result.schema, null, 2) : ''), [result?.schema]);
  const reportJson = useMemo(() => (result?.validation ? JSON.stringify(result.validation, null, 2) : ''), [result?.validation]);
  const busy = job && ACTIVE_STATUSES.has(job.status);
  return (
    <Tile
      title="React implementation"
      eyebrow="Result"
      className="area-result"
      bodyClassName="flex flex-col gap-3 flex-1"
      actions={result?.code && (
        <>
          <Button size="sm" variant="ghost" onClick={onFullView} aria-label="Open preview in full view"><Icon path={ICONS.expand} />Full view</Button>
          <Button size="sm" onClick={onRegenerate} loading={regenerating} disabled={!canRegenerate}><Icon path={ICONS.refresh} />Regenerate</Button>
          <Button size="sm" variant="primary" onClick={onExport} loading={exporting}><Icon path={ICONS.download} />Export .zip</Button>
        </>
      )}
    >
      {!job && <EmptyState title="Nothing generated yet">Your React component, its schema and the validation report appear here.</EmptyState>}
      {job && busy && <div className="py-16 grid place-items-center text-text-muted"><Spinner label="Waiting for the pipeline to finish…" /></div>}
      {job && !busy && !result && job.status === 'cancelled' && <EmptyState title="This run was cancelled">Start a new generation or regenerate from history.</EmptyState>}
      {job && !busy && !result && job.status === 'failed' && <EmptyState title="No result">This run failed before producing code. See the progress panel for the reason.</EmptyState>}
      {result && (
        <>
          {!result.validation?.valid && result.code && (
            <Alert tone="warning" title="Review needed">{result.validation?.generatedJsxCompileError || 'Structural validation reported differences from the schema. See the Report tab.'}</Alert>
          )}
          <Tabs tabs={tabs} active={tab} onChange={setTab} label="Result views" />
          <TabPanel id="preview" active={tab}><SandboxedPreview preview={result.preview} height="62vh" /></TabPanel>
          <TabPanel id="code" active={tab}><CodeView code={result.code} title="src/GeneratedComponent.jsx" /></TabPanel>
          <TabPanel id="schema" active={tab}><CodeView code={schemaJson} title="schema.json" /></TabPanel>
          <TabPanel id="report" active={tab}><CodeView code={reportJson} title="validation-report.json" /></TabPanel>
        </>
      )}
    </Tile>
  );
}

/* ----------------------------------------------------------------- source */

export function SourceTile({ src, detections, canvas, onFullView }) {
  const [overlays, setOverlays] = useState(true);
  const [zoom, setZoom] = useState(1);
  const width = canvas?.width || 1024;
  const height = canvas?.height || 1024;
  return (
    <Tile
      title="Source wireframe"
      eyebrow={detections?.length ? `${detections.length} regions detected` : 'Source'}
      className="area-source"
      actions={src && (
        <>
          <label className="inline-flex items-center gap-2 text-label text-text-muted"><input type="checkbox" checked={overlays} onChange={(e) => setOverlays(e.target.checked)} className="accent-[rgb(var(--accent))]" />Overlays</label>
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</Button>
          <span className="text-caption normal-case tracking-normal text-text-subtle w-10 text-center" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</Button>
          {onFullView && <Button size="sm" variant="ghost" onClick={onFullView} aria-label="Open source in full view"><Icon path={ICONS.expand} /></Button>}
        </>
      )}
    >
      {!src ? (
        <EmptyState title="No image selected">Choose a wireframe, or open a run from history.</EmptyState>
      ) : (
        <SourceImage src={src} detections={detections} width={width} height={height} overlays={overlays} zoom={zoom} />
      )}
    </Tile>
  );
}

export function SourceImage({ src, detections = [], width, height, overlays = true, zoom = 1 }) {
  return (
    <div className="max-h-[60vh] overflow-auto scroll-thin rounded-md bg-surface-2">
      <div className="relative" style={{ width: `${zoom * 100}%` }}>
        <img src={src} alt="Uploaded wireframe" className="block w-full h-auto" />
        {overlays && detections.length > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            {detections.map((d, i) => (
              <rect key={`${d.type}-${i}`} x={d.x} y={d.y} width={d.width} height={d.height} fill="rgb(var(--accent) / 0.06)" stroke="rgb(var(--accent))" strokeWidth={Math.max(1.5, width / 600)} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- validation */

function Metric({ label, value, tone = 'text-text' }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <dt className="text-caption normal-case tracking-normal text-text-subtle">{label}</dt>
      <dd className={`text-title ${tone}`}>{value}</dd>
    </div>
  );
}

export function ValidationTile({ result }) {
  const v = result?.validation;
  if (!v) {
    return <Tile title="Validation" eyebrow="Checks" className="area-validation"><p className="text-text-muted">Structural checks, the hallucination filter and fidelity notes appear after a run.</p></Tile>;
  }
  const accuracy = v.diff?.structuralAccuracy;
  const stripped = v.cgda?.stripped || [];
  const violations = v.structuralViolations || [];
  const fidelity = v.fidelity || {};
  return (
    <Tile title="Validation" eyebrow="Checks" className="area-validation" bodyClassName="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2">
        <Metric label="Schema coverage" value={accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`} tone={accuracy === 1 ? 'text-success' : 'text-warning'} />
        <Metric label="Compiles" value={v.generatedJsxStaticValid ? 'Yes' : 'No'} tone={v.generatedJsxStaticValid ? 'text-success' : 'text-danger'} />
        <Metric label="Filtered elements" value={stripped.length} tone={stripped.length ? 'text-warning' : 'text-text'} />
        <Metric label="Retries" value={v.attempts ?? 0} />
      </dl>
      {violations.length > 0 && <Alert tone="danger" title="Structural problems">{violations.map((x) => x.type).join(', ')}</Alert>}
      {stripped.length > 0 && (
        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-label">Elements removed by the filter ({stripped.length})</summary>
          <ul className="mt-2 text-caption normal-case tracking-normal text-text-muted list-disc pl-5">
            {stripped.slice(0, 20).map((s, i) => <li key={i}><code>&lt;{s.tag}&gt;</code> — {s.reason}{s.line ? ` (line ${s.line})` : ''}</li>)}
          </ul>
        </details>
      )}
      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-label">Fidelity: {fidelity.passed ? 'ready' : 'needs review'} <span className="text-text-subtle">· advisory</span></summary>
        <ul className="mt-2 text-caption normal-case tracking-normal text-text-muted list-disc pl-5">
          {(fidelity.reasons || []).slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}
          {!(fidelity.reasons || []).length && <li>No fidelity concerns reported.</li>}
        </ul>
      </details>
      <p className="text-caption normal-case tracking-normal text-text-subtle">
        Source: {result.job?.schemaSource || 'local'} · Vision: {result.detectionMeta?.vision?.status || 'disabled'} · Mode: {result.job?.genMode || 'template'}
      </p>
    </Tile>
  );
}

/* ---------------------------------------------------------------- history */

export function HistoryTile({ jobs, loading, error, selectedId, onOpen, onDelete, hasMore, onLoadMore, onRetry }) {
  const listRef = useRef(null);
  return (
    <Tile title="History" eyebrow="This project" className="area-history">
      {error && <Alert tone="danger" action={<Button size="sm" onClick={onRetry}>Retry</Button>}>Could not load this project's runs.</Alert>}
      {loading && !jobs.length && <Spinner label="Loading runs…" />}
      {!loading && !error && !jobs.length && <p className="text-text-muted">No runs yet in this project.</p>}
      {jobs.length > 0 && (
        <ul ref={listRef} className="divide-y divide-border max-h-80 overflow-auto scroll-thin -mx-1">
          {jobs.map((job) => (
            <li key={job.id} className={`flex flex-wrap items-center gap-3 px-1 py-2 ${job.id === selectedId ? 'bg-accent/5' : ''}`}>
              <button type="button" onClick={() => onOpen(job.id)} aria-current={job.id === selectedId ? 'true' : undefined} className="flex-1 min-w-0 text-left rounded-sm">
                <span className="flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  <span className="text-text truncate">{job.source.filename}</span>
                </span>
                <span className="block text-caption normal-case tracking-normal text-text-subtle truncate">{formatTime(job.createdAt)}{job.instructions ? ` · “${job.instructions.slice(0, 80)}”` : ''}</span>
              </button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(job)} aria-label={`Delete run ${job.source.filename} from ${formatTime(job.createdAt)}`}><Icon path={ICONS.trash} /></Button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && <div className="mt-2"><Button size="sm" variant="ghost" onClick={onLoadMore}>Load older runs</Button></div>}
    </Tile>
  );
}
