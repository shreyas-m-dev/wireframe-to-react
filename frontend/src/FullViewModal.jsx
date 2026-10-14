import React, { useCallback, useEffect, useRef, useState } from 'react';

const focusable = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export default function FullViewModal({ title, children, onClose }) {
  const dialogRef = useRef(null); const viewerRef = useRef(null); const contentRef = useRef(null); const openerRef = useRef(document.activeElement);
  const [zoom, setZoom] = useState(1); const [fitScale, setFitScale] = useState(1); const [full, setFull] = useState(false);
  const fit = useCallback(() => {
    const viewer = viewerRef.current; const content = contentRef.current;
    if (!viewer || !content) return;
    const availableWidth = Math.max(1, viewer.clientWidth - 32); const availableHeight = Math.max(1, viewer.clientHeight - 32);
    // scroll dimensions retain the untransformed size of images and rendered JSX.
    const contentWidth = Math.max(1, content.scrollWidth); const contentHeight = Math.max(1, content.scrollHeight);
    const next = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
    setFitScale(next); setZoom(next);
  }, []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const keydown = (event) => { if (event.key === 'Escape') onClose(); if (event.key === 'Tab') { const list = [...dialogRef.current?.querySelectorAll(focusable) || []]; if (!list.length) return; const first = list[0], last = list[list.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } };
    const changed = () => { setFull(Boolean(document.fullscreenElement)); requestAnimationFrame(fit); };
    const resize = new ResizeObserver(() => fit()); document.addEventListener('keydown', keydown); document.addEventListener('fullscreenchange', changed); if (viewerRef.current) resize.observe(viewerRef.current); requestAnimationFrame(fit); dialogRef.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); document.removeEventListener('fullscreenchange', changed); resize.disconnect(); openerRef.current?.focus?.(); };
  }, [fit, onClose]);
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await dialogRef.current?.requestFullscreen?.(); } catch { /* optional enhancement only */ } };
  return <div className="fullview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="fullview-dialog" role="dialog" aria-modal="true" aria-labelledby="fullview-title"><header className="fullview-toolbar"><h2 id="fullview-title">{title}</h2><div className="flex flex-wrap gap-2"><button className="panel-button" onClick={fit} aria-label="Fit complete content in view">Fit</button><button className="panel-button" onClick={() => setZoom((value) => Math.min(3, value + .2))} aria-label="Zoom in">Zoom in</button><button className="panel-button" onClick={() => setZoom((value) => Math.max(.2, value - .2))} aria-label="Zoom out">Zoom out</button><button className="panel-button" onClick={() => setZoom(fitScale)} aria-label="Reset zoom to fitted scale">Reset</button><button className="panel-button" onClick={toggleFullscreen} aria-label={full ? 'Exit browser fullscreen' : 'Enter browser fullscreen'}>{full ? 'Exit fullscreen' : 'Fullscreen'}</button><button className="panel-button" onClick={onClose} aria-label="Close full view">Close</button></div></header><div ref={viewerRef} className="fullview-content"><div ref={contentRef} className="fullview-scaled" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>{children}</div></div></section></div>;
}
