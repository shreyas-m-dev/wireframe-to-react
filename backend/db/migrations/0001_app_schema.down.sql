-- Reverts 0001. Destroys all project/job data: run only against a database
-- whose data you intend to discard (see docs/OPERATIONS_RUNBOOK.md).
drop table if exists app.artifacts;
drop table if exists app.job_results;
drop table if exists app.jobs;
drop table if exists app.projects;
drop function if exists app.touch_updated_at();
drop schema if exists app;
