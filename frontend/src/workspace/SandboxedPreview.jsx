import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spinner } from '../ui';

const HEARTBEAT_TIMEOUT_MS = 4000;
const FRAME_START_TIMEOUT_MS = 20000; // first load of the ~500 KB frame can be slow on a cold dev server
const RENDER_TIMEOUT_MS = 10000;      // measured from the frame being ready, not from mount

// Messages for each way the preview can fail to appear. "Blocked" cases are
// almost always a browser extension (ad/script/privacy blocker) or policy.
const FAILURE = {
  // A blocked frame still fires onLoad (the browser loads its own error page
  // into it), so "request blocked" and "scripts blocked" look the same here.
  frameBlocked: "The preview frame didn't start: your browser blocked it. A browser extension (ad, script or privacy blocker) or a browser policy is the usual cause. Try an Incognito window, or allow this site in your blocker. The Code tab and Export still work.",
  renderTimeout: 'The preview took too long to render and was shut down.',
  hung: 'The preview stopped responding and was shut down. The generated code may contain an infinite loop.',
};

/**
 * Renders generated code in /preview-frame.html inside
 * <iframe sandbox="allow-scripts"> — no allow-same-origin, so the frame has an
 * opaque origin: it cannot read this app's DOM, storage or Supabase session,
 * and its own CSP blocks all network access. The code is compiled on the
 * server; nothing generated is evaluated in this document.
 *
 * Messages are accepted only from this iframe's window and only for the
 * current render nonce. A frame that stops sending heartbeats (e.g. an
 * infinite loop) is removed. That only helps when the browser runs the frame
 * on a separate thread/process — Chromium's site isolation of sandboxed
 * frames does; a same-thread frame will still freeze the tab.
 */
export default function SandboxedPreview({ preview, height = '70vh', onStatus }) {
  const frameRef = useRef(null);
  const readyRef = useRef(false); // frame has loaded its runtime and can accept renders
  const [frameKey, setFrameKey] = useState(0);
  const [state, setState] = useState({ phase: 'loading' });
  const [halted, setHalted] = useState(false);

  useEffect(() => {
    if (!preview || halted) return undefined;
    const nonce = crypto.randomUUID();
    let lastBeat = Date.now();
    let rendered = false;
    const seen = []; // message types received from the frame, for diagnostics
    setState({ phase: 'loading' });

    const send = () => frameRef.current?.contentWindow?.postMessage({ type: 'render', nonce, js: preview.js, componentName: preview.componentName }, '*');
    const onMessage = (event) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'w2r-preview') return;
      lastBeat = Date.now();
      if (seen.length < 20 && data.type !== 'heartbeat') seen.push(data.type);
      if (data.type === 'ready') { readyRef.current = true; send(); return; }
      if (data.nonce !== nonce) return;
      if (data.type === 'rendered') { rendered = true; setState({ phase: 'rendered' }); onStatus?.({ renderSuccess: true }); }
      if (data.type === 'error') { console.warn('[w2r-preview]', { failure: 'generatedCodeError', phase: data.phase, message: data.message }); setState({ phase: 'error', message: data.message, stage: data.phase }); onStatus?.({ renderSuccess: false, renderError: data.message }); }
    };
    window.addEventListener('message', onMessage);
    if (readyRef.current) send(); // frame already loaded: a new result just needs a new render
    const started = Date.now();
    let readyAt = readyRef.current ? started : null;
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (readyRef.current && readyAt === null) readyAt = now;
      let failure = null;
      if (readyRef.current && now - lastBeat > HEARTBEAT_TIMEOUT_MS) failure = 'hung';
      else if (!rendered && readyAt !== null && now - readyAt > RENDER_TIMEOUT_MS) failure = 'renderTimeout';
      else if (!readyRef.current && now - started > FRAME_START_TIMEOUT_MS) failure = 'frameBlocked';
      if (failure) {
        clearInterval(watchdog);
        readyRef.current = false;
        setHalted(true);
        console.warn('[w2r-preview]', { failure, framesMessages: seen, waitedMs: now - started, frameSrc: frameRef.current?.src, userAgent: navigator.userAgent });
        setState({ phase: 'error', message: `${FAILURE[failure]} (code: ${failure})` });
        onStatus?.({ renderSuccess: false, renderError: failure });
      }
    }, 1000);
    return () => { window.removeEventListener('message', onMessage); clearInterval(watchdog); };
  }, [preview, frameKey, halted, onStatus]);

  if (!preview) {
    return <Alert tone="warning" title="No preview available">The generated code did not compile, so there is nothing to render. See the validation report.</Alert>;
  }

  const restart = () => { readyRef.current = false; setHalted(false); setFrameKey((k) => k + 1); };

  return (
    <div className="flex flex-col gap-2">
      {state.phase === 'error' && (
        <Alert tone="danger" title="Preview error" action={<Button size="sm" onClick={restart}>Reload preview</Button>}>
          {state.message}
        </Alert>
      )}
      <div className="relative rounded-md border border-border overflow-hidden bg-white" style={{ height }}>
        {state.phase === 'loading' && !halted && (
          <div className="absolute inset-0 grid place-items-center bg-surface-1 text-text-muted"><Spinner label="Rendering preview…" /></div>
        )}
        {!halted && (
          <iframe
            key={frameKey}
            ref={frameRef}
            title="Generated component preview"
            src="/preview-frame.html"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
