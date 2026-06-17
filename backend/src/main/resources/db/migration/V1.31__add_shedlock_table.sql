-- Table used by ShedLock to coordinate scheduled tasks across backend replicas.
-- Only one replica can hold the lock for a given task name at a time, so scheduled
-- tasks run once per interval regardless of how many replicas are deployed.
-- Schema as required by net.javacrumbs.shedlock:shedlock-provider-jdbc-template.
CREATE TABLE shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMP NOT NULL,
    locked_at TIMESTAMP NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
