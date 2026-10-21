import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { navigate, workspacePath } from '../lib/router';
import { useTheme } from '../lib/theme';
import { Alert, Button, EmptyState, Icon, ICONS, Spinner, TextInput } from '../ui';
import FullViewModal from '../FullViewModal';
import SandboxedPreview from './SandboxedPreview';
import { useJob, useMe, useProjectJobs, useProjects, useSourceImage } from './hooks';
import { HistoryTile, InputTile, ProgressTile, ResultTile, SourceImage, SourceTile, ValidationTile } from './tiles';

function TopBar({ onMenu, email, onSignOut }) {
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // Close on Escape from anywhere and on any click outside the menu.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    const onPointer = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [menuOpen]);
  return (
    <header className="glass sticky top-0 z-30 border-b border-border">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onMenu} aria-label="Open projects"><Icon path={ICONS.menu} size={18} /></Button>
        <a href="/app" onClick={(e) => { e.preventDefault(); navigate('/app'); }} className="font-semibold text-text whitespace-nowrap">Wireframe <span className="text-accent" aria-hidden="true">→</span><span className="sr-only">to</span> React</a>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={theme.cycle} aria-label={`Theme: ${theme.choice}. Change theme`}><Icon path={ICONS.theme} /><span className="hidden sm:inline capitalize">{theme.choice}</span></Button>
        <div className="relative" ref={menuRef}>
          <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span className="max-w-[180px] truncate">{email}</span>
          </Button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-56 tile p-1 z-40">
              <button role="menuitem" type="button" className="w-full text-left rounded-sm px-3 py-2 hover:bg-surface-2" onClick={() => onSignOut(false)}>Sign out</button>
              <button role="menuitem" type="button" className="w-full text-left rounded-sm px-3 py-2 hover:bg-surface-2" onClick={() => onSignOut(true)}>Sign out on all devices</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ProjectRail({ projects, selectedId, onSelect, onCreate, onRename, onDelete, loading, error, onRetry }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const inputId = useId(); // the rail renders twice (sidebar + mobile drawer); ids must stay unique
  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true); setCreateError(null);
    try { await onCreate(name.trim()); setName(''); } catch (e) { setCreateError(describeError(e)); } finally { setCreating(false); }
  };
  return (
    <nav aria-label="Projects" className="flex flex-col gap-3 h-full">
      <p className="eyebrow px-1">Projects</p>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">New project name</label>
        <TextInput id={inputId} placeholder="New project" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="md" loading={creating} disabled={!name.trim()} aria-label="Create project"><Icon path={ICONS.plus} /></Button>
      </form>
      {createError && <Alert tone="danger">{createError}</Alert>}
      {error && <Alert tone="danger" action={<Button size="sm" onClick={onRetry}>Retry</Button>}>Could not load projects.</Alert>}
      {loading && !projects?.length && <Spinner label="Loading projects…" />}
      <ul className="flex flex-col gap-1 overflow-auto scroll-thin">
        {(projects || []).map((project) => (
          <li key={project.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(project.id)}
              aria-current={project.id === selectedId ? 'page' : undefined}
              className={`flex-1 min-w-0 flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors duration-fast
                ${project.id === selectedId ? 'bg-accent/15 text-text' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}
            >
              <Icon path={ICONS.folder} /><span className="truncate">{project.name}</span>
            </button>
            <Button size="sm" variant="ghost" className="opacity-70 group-hover:opacity-100" aria-label={`Rename ${project.name}`} onClick={() => { const next = window.prompt('Rename project', project.name); if (next && next.trim() && next.trim() !== project.name) onRename(project.id, next.trim()); }}><Icon path={ICONS.pencil} /></Button>
            <Button size="sm" variant="ghost" className="opacity-70 group-hover:opacity-100" aria-label={`Delete ${project.name}`} onClick={() => onDelete(project)}><Icon path={ICONS.trash} /></Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Workspace({ params }) {
  const { api, user, signOut } = useAuth();
  const me = useMe(api);
  const projects = useProjects(api);
  const projectId = params.projectId || null;
  const jobId = params.jobId || null;
  const history = useProjectJobs(api, projectId);
  const { job, result, error: jobError, setJob } = useJob(api, jobId);

  const [drawer, setDrawer] = useState(false);
  const [file, setFile] = useState(null);
  const [localSource, setLocalSource] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [fullView, setFullView] = useState(null);

  // Default route: open the most recent project.
  useEffect(() => {
    if (!projectId && projects.data?.length) navigate(workspacePath(projects.data[0].id), { replace: true });
  }, [projectId, projects.data]);
  // Default job: the most recent run of the project.
  useEffect(() => {
    if (projectId && !jobId && history.jobs.length && !file) navigate(workspacePath(projectId, history.jobs[0].id), { replace: true });
  }, [projectId, jobId, history.jobs, file]);
  // Keep the history row in sync with the job being followed.
  useEffect(() => {
    if (job && history.jobs.some((j) => j.id === job.id && j.status !== job.status)) history.reload();
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (localSource) URL.revokeObjectURL(localSource); }, [localSource]);
  useEffect(() => { if (job?.instructions !== undefined && !file) setInstructions(job.instructions || ''); }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const storedSource = useSourceImage(api, file ? null : jobId, Boolean(job?.source?.available));
  const sourceUrl = file ? localSource : storedSource;

  const chooseFile = (next) => {
    if (localSource) URL.revokeObjectURL(localSource);
    setFile(next);
    setLocalSource(URL.createObjectURL(next));
    setSubmitError(null);
  };

  const generate = useCallback(async () => {
    if (!file || !projectId || submitting) return;
    setSubmitting(true); setSubmitError(null);
    const form = new FormData();
    form.append('wireframe', file);
    form.append('instructions', instructions);
    try {
      // One key per submission: a network retry of the same click can't start a second run.
      const { job: created } = await api(`/api/projects/${projectId}/jobs`, { method: 'POST', form, headers: { 'Idempotency-Key': crypto.randomUUID() } });
      setFile(null);
      setJob(created);
      history.reload();
      navigate(workspacePath(projectId, created.id));
    } catch (error) {
      setSubmitError(describeError(error)); // file and instructions are kept for retry
    } finally {
      setSubmitting(false);
    }
  }, [api, file, instructions, projectId, submitting, history, setJob]);

  const runAction = async (name, fn) => {
    setBusyAction(name); setActionError(null);
    try { await fn(); } catch (error) { setActionError(describeError(error)); } finally { setBusyAction(null); }
  };

  const cancel = () => runAction('cancel', async () => { const { job: updated } = await api(`/api/jobs/${job.id}/cancel`, { method: 'POST' }); setJob(updated); history.reload(); });
  const regenerate = () => runAction('regenerate', async () => {
    const { job: created } = await api(`/api/jobs/${job.id}/regenerate`, { method: 'POST', json: { instructions }, headers: { 'Idempotency-Key': crypto.randomUUID() } });
    history.reload();
    navigate(workspacePath(projectId, created.id));
  });
  const exportZip = () => runAction('export', async () => {
    const blob = await api(`/api/jobs/${job.id}/export`, { as: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: `generated-${job.id.slice(0, 8)}.zip` });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const deleteJob = (target) => runAction('delete', async () => {
    if (!window.confirm(`Delete the run "${target.source.filename}"? Its code and stored image are removed permanently.`)) return;
    await api(`/api/jobs/${target.id}`, { method: 'DELETE' });
    history.reload();
    if (target.id === jobId) navigate(workspacePath(projectId), { replace: true });
  });
  const deleteProject = (project) => runAction('delete-project', async () => {
    if (!window.confirm(`Delete project "${project.name}" and all of its runs? This cannot be undone.`)) return;
    await projects.remove(project.id);
    if (project.id === projectId) navigate('/app', { replace: true });
  });

  const rail = (
    <ProjectRail
      projects={projects.data} loading={projects.loading} error={projects.error} onRetry={projects.reload}
      selectedId={projectId}
      onSelect={(id) => { setDrawer(false); setFile(null); navigate(workspacePath(id)); }}
      onCreate={async (name) => { const p = await projects.create(name); setDrawer(false); navigate(workspacePath(p.id)); }}
      onRename={(id, name) => runAction('rename', () => projects.rename(id, name))}
      onDelete={deleteProject}
    />
  );

  const currentProject = projects.data?.find((p) => p.id === projectId);
  const shownJob = file ? null : job;
  const shownResult = file ? null : result;

  return (
    <div className="min-h-dvh">
      <TopBar onMenu={() => setDrawer(true)} email={user?.email} onSignOut={(everywhere) => signOut({ everywhere })} />
      <div className="mx-auto flex max-w-[1600px] gap-[var(--gutter)] px-4 py-[var(--gutter)]">
        <aside className="hidden lg:block w-64 shrink-0 sticky top-[72px] self-start max-h-[calc(100dvh-88px)]">{rail}</aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Projects">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 w-[85vw] max-w-xs bg-surface-1 border-r border-border p-4 shadow-2">
              <div className="flex justify-end mb-2"><Button size="sm" variant="ghost" onClick={() => setDrawer(false)} aria-label="Close projects"><Icon path={ICONS.x} /></Button></div>
              {rail}
            </div>
          </div>
        )}
        <main className="flex-1 min-w-0">
          {!projects.loading && !projects.error && !projects.data?.length && (
            <div className="tile"><EmptyState title="Create your first project" action={<Button variant="primary" onClick={() => setDrawer(true)} className="lg:hidden">Open projects</Button>}>Projects keep related wireframes and their generated code together. Name one in the Projects panel to begin.</EmptyState></div>
          )}
          {projectId && !currentProject && projects.data && !projects.loading && (
            <div className="tile"><EmptyState title="Project not found">It may have been deleted. Pick another project.</EmptyState></div>
          )}
          {currentProject && (
            <>
              <div className="mb-[var(--gutter)] flex flex-wrap items-end justify-between gap-2">
                <div><p className="eyebrow">Project</p><h1 className="text-display text-text">{currentProject.name}</h1></div>
                {actionError && <div className="w-full sm:w-auto"><Alert tone="danger">{actionError}</Alert></div>}
              </div>
              <div className="bento">
                <InputTile file={file} onFile={chooseFile} instructions={instructions} onInstructions={setInstructions} onGenerate={generate}
                  submitting={submitting} error={submitError} disabled={!projectId} limits={me.data?.limits} genMode={me.data?.genMode} />
                <ProgressTile job={shownJob} onCancel={cancel} cancelling={busyAction === 'cancel'} error={jobError && shownJob ? jobError : null} />
                <ResultTile job={shownJob} result={shownResult} onExport={exportZip} exporting={busyAction === 'export'}
                  onRegenerate={regenerate} regenerating={busyAction === 'regenerate'} canRegenerate={Boolean(job?.source?.available)} onFullView={() => setFullView('preview')} />
                <SourceTile src={sourceUrl} detections={shownResult?.detections} canvas={shownResult?.detectionMeta?.canvas} onFullView={sourceUrl ? () => setFullView('source') : null} />
                <ValidationTile result={shownResult} />
                <HistoryTile jobs={history.jobs} loading={history.loading} error={history.error} onRetry={history.reload} selectedId={jobId}
                  onOpen={(id) => { setFile(null); navigate(workspacePath(projectId, id)); }} onDelete={deleteJob} hasMore={history.hasMore} onLoadMore={history.loadMore} />
              </div>
            </>
          )}
        </main>
      </div>
      {fullView === 'preview' && shownResult?.preview && (
        <FullViewModal title="Generated preview" onClose={() => setFullView(null)}><SandboxedPreview preview={shownResult.preview} height="80vh" /></FullViewModal>
      )}
      {fullView === 'source' && sourceUrl && (
        <FullViewModal title="Source wireframe" onClose={() => setFullView(null)}>
          <SourceImage src={sourceUrl} detections={shownResult?.detections} width={shownResult?.detectionMeta?.canvas?.width || 1024} height={shownResult?.detectionMeta?.canvas?.height || 1024} />
        </FullViewModal>
      )}
    </div>
  );
}
