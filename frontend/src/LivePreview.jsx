import React, { useEffect, useMemo } from 'react';
import { compileGeneratedPreview } from './previewTransform';

function Icon({ name, className }) {
  return <span className={`inline-flex items-center justify-center rounded bg-accent/20 text-accent text-[10px] ${className || ''}`} title={name}>◇</span>;
}

function fingerprint(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function PreviewError({ message }) {
  return <div className="border border-danger/40 bg-danger/10 rounded-lg p-4 text-sm"><p className="text-danger font-medium mb-1">Preview couldn't render this generated code.</p><p className="text-text-dim">{message}</p><p className="text-text-faint mt-2">No schema or placeholder fallback was substituted. Inspect the Code tab or debug diagnostics.</p></div>;
}

class PreviewErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() { return this.state.error ? <PreviewError message={this.state.error.message} /> : this.props.children; }
}

function RenderProbe({ onSuccess }) { useEffect(() => { onSuccess(); }, [onSuccess]); return null; }

function useCompiledComponent(rawCode) {
  return useMemo(() => {
    if (!rawCode || !rawCode.trim()) return { Component: null, error: null };
    if (typeof window === 'undefined' || !window.Babel) return { Component: null, error: 'Babel standalone failed to load. The preview cannot execute JSX in this environment.' };
    try {
      return { Component: compileGeneratedPreview(rawCode, window.Babel, React, Icon), error: null };
    } catch (error) { return { Component: null, error: error.message }; }
  }, [rawCode]);
}

export default function LivePreview({ code, artifact, validation, onDiagnostics }) {
  if (validation?.generatedJsxStaticValid === false) return <PreviewError message={validation.generatedJsxCompileError || 'Generated JSX failed the server-side parser gate.'} />;
  const { Component, error } = useCompiledComponent(code);
  const identity = useMemo(() => ({ source: error ? 'error-fallback' : 'generated-jsx', hash: fingerprint(code || ''), length: (code || '').length, artifactId: artifact?.id || null, generatedAt: artifact?.generatedAt || null, renderError: error || null, renderSuccess: false }), [code, artifact?.id, artifact?.generatedAt, error]);
  const report = (patch) => onDiagnostics?.({ ...identity, ...patch });
  useEffect(() => { report({}); }, [identity]);
  if (error) return <PreviewError message={error} />;
  if (!Component) return <p className="text-text-faint text-sm">Nothing to preview yet.</p>;
  return <div className="rounded-lg overflow-hidden"><PreviewErrorBoundary key={identity.hash} onError={(renderError) => report({ source: 'error-fallback', renderError: renderError.message, renderSuccess: false })}><RenderProbe onSuccess={() => report({ renderSuccess: true, renderError: null })} /><Component /></PreviewErrorBoundary></div>;
}
