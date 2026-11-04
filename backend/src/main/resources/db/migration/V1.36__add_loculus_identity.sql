create table loculus_users (
    id uuid primary key,
    username text not null check (username <> '' and username = lower(username) and username = btrim(username)),
    given_name text,
    family_name text,
    affiliation text,
    orcid_id text,
    provisioned_at timestamp not null
);
create unique index loculus_users_username_lower_key on loculus_users(lower(username));
comment on column loculus_users.username is
    'Immutable Loculus-owned username, seeded from the provider. Ownership and authorization use the UUID.';
comment on table loculus_users is
    'Profiles are seeded once. Provider refresh and Loculus profile editing are deferred; login does not overwrite values.';
comment on column loculus_users.provisioned_at is
    'UTC time this account was provisioned into Loculus, not its creation time at the identity provider.';

create table external_identities (
    issuer text not null,
    subject text not null,
    user_id uuid not null references loculus_users(id),
    linked_at timestamp not null,
    constraint external_identities_issuer_subject_key primary key (issuer, subject)
);
create index external_identities_user_id_idx on external_identities(user_id);

comment on column loculus_users.orcid_id is
    'Imported profile identifier, not proof of ORCID ownership. Initial source is the provisioning external identity.';
