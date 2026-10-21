import { useEffect, useState } from 'react';

/**
 * Minimal client-side router: a handful of fixed routes, internal paths only.
 * (React Router 6 was not used: its open-redirect advisories had no fix in
 * the 6.x line, and five routes don't need it.)
 */

const ROUTES = [
  ['login', /^\/login\/?$/],
  ['signup', /^\/signup\/?$/],
  ['forgot', /^\/forgot-password\/?$/],
  ['reset', /^\/reset-password\/?$/],
  ['resend', /^\/resend-confirmation\/?$/],
  ['callback', /^\/auth\/callback\/?$/],
  ['workspace', /^\/app\/?$/],
  ['workspace', /^\/app\/p\/(?<projectId>[0-9a-f-]{36})\/?$/i],
  ['workspace', /^\/app\/p\/(?<projectId>[0-9a-f-]{36})\/j\/(?<jobId>[0-9a-f-]{36})\/?$/i],
  ['root', /^\/$/],
];

export function matchRoute(pathname) {
  for (const [name, pattern] of ROUTES) {
    const match = pattern.exec(pathname);
    if (match) return { name, params: { ...(match.groups || {}) } };
  }
  return { name: 'notFound', params: {} };
}

/** Only same-app absolute paths are navigable; anything else is ignored. */
export function isSafeInternalPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !/^\/[a-z]+:/i.test(path);
}

export function navigate(path, { replace = false } = {}) {
  if (!isSafeInternalPath(path)) return;
  if (path === window.location.pathname) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  const [route, setRoute] = useState(() => matchRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(matchRoute(window.location.pathname));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return route;
}

export function workspacePath(projectId, jobId) {
  if (!projectId) return '/app';
  return jobId ? `/app/p/${projectId}/j/${jobId}` : `/app/p/${projectId}`;
}
