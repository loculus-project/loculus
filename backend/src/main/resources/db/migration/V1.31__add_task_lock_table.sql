create table task_lock (
    task_name  text primary key,
    started_at timestamptz not null default now(),
    locked_until timestamptz not null
);
