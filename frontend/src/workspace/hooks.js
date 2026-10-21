import { useCallback, useEffect, useRef, useState } from 'react';

export const ACTIVE_STATUSES = new Set(['queued', 'running']);

/** Generic async loader with cancellation; `reload` re-runs it. */
function useLoader(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    load(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (!controller.signal.aborted && error?.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false })); });
    return () => controller.abort();
  }, [...deps, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload, setData: (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })) };
}

export function useMe(api) {
  return useLoader((signal) => api('/api/me', { signal }), [api]);
}

export function useProjects(api) {
  const loader = useLoader(async (signal) => (await api('/api/projects?limit=100', { signal })).projects, [api]);
  const create = async (name) => {
    const { project } = await api('/api/projects', { method: 'POST', json: { name } });
    loader.setData((list) => [project, ...(list || [])]);
    return project;
  };
  const rename = async (id, name) => {
    const { project } = await api(`/api/projects/${id}`, { method: 'PATCH', json: { name } });
    loader.setData((list) => (list || []).map((p) => (p.id === id ? project : p)));
  };
  const remove = async (id) => {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    loader.setData((list) => (list || []).filter((p) => p.id !== id));
  };
  return { ...loader, create, rename, remove };
}

/** Jobs for a project; re-polls every 2 s while any job is still active. */
export function useProjectJobs(api, projectId) {
  const [cursor, setCursor] = useState(null);
  const loader = useLoader(async (signal) => {
    if (!projectId) return { jobs: [], nextCursor: null };
    return api(`/api/projects/${projectId}/jobs?limit=20`, { signal });
  }, [api, projectId]);
  const active = (loader.data?.jobs || []).some((job) => ACTIVE_STATUSES.has(job.status));
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(loader.reload, 2000);
    return () => clearTimeout(timer);
  }, [active, loader.data, loader.reload]);
  useEffect(() => { setCursor(loader.data?.nextCursor || null); }, [loader.data]);
  const loadMore = async () => {
    if (!cursor) return;
    const page = await api(`/api/projects/${projectId}/jobs?limit=20&cursor=${encodeURIComponent(cursor)}`);
    loader.setData((data) => ({ jobs: [...(data?.jobs || []), ...page.jobs], nextCursor: page.nextCursor }));
  };
  return { ...loader, jobs: loader.data?.jobs || [], hasMore: Boolean(cursor), loadMore };
}

/**
 * Follows one job: polls status (1 s, backing off to 3 s) until it reaches a
 * terminal state, then fetches the result once. Stops on unmount or job change.
 */
export function useJob(api, jobId) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const resultFor = useRef(null);

  useEffect(() => {
    setJob(null); setResult(null); setError(null); resultFor.current = null;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return undefined;
    const controller = new AbortController();
    let timer;
    let delay = 1000;
    const poll = async () => {
      try {
        const { job: next } = await api(`/api/jobs/${jobId}`, { signal: controller.signal });
        setJob(next);
        setError(null);
        if (ACTIVE_STATUSES.has(next.status)) {
          timer = setTimeout(poll, delay);
          delay = Math.min(3000, delay + 500);
          return;
        }
        if (next.status !== 'cancelled' && resultFor.current !== jobId) {
          resultFor.current = jobId;
          try {
            setResult(await api(`/api/jobs/${jobId}/result`, { signal: controller.signal }));
          } catch (resultError) {
            if (resultError?.status !== 409 && resultError?.name !== 'AbortError') setError(resultError);
          }
        }
      } catch (pollError) {
        if (pollError?.name === 'AbortError') return;
        setError(pollError);
        if (pollError?.status === 0 || pollError?.status >= 500) timer = setTimeout(poll, 5000); // transient: keep following
      }
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api, jobId, tick]);

  const refresh = useCallback(() => { resultFor.current = null; setTick((t) => t + 1); }, []);
  return { job, result, error, refresh, setJob };
}

/** Fetches a job's stored source image as an object URL (auth header required, so no <img src>). */
export function useSourceImage(api, jobId, available) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!jobId || !available) { setUrl(null); return undefined; }
    const controller = new AbortController();
    let objectUrl = null;
    api(`/api/jobs/${jobId}/source`, { signal: controller.signal, as: 'blob' })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => setUrl(null));
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, jobId, available]);
  return url;
}
