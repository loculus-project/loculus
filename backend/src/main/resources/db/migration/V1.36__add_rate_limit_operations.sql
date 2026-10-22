-- One row per write request and group, so rate limits are counted from what was done, not from what still exists.
CREATE TABLE rate_limit_operations (
    id bigserial PRIMARY KEY,
    created_at timestamp NOT NULL,
    operation text NOT NULL,
    group_id integer,
    username text NOT NULL,
    count bigint NOT NULL
);

CREATE INDEX rate_limit_operations_created_at_idx ON rate_limit_operations (created_at);

-- When each quota last alerted per threshold, shared by all backend instances and surviving restarts.
CREATE TABLE rate_limit_alerts (
    quota text NOT NULL,
    threshold_percent integer NOT NULL,
    sent_at timestamp NOT NULL,
    PRIMARY KEY (quota, threshold_percent)
);
