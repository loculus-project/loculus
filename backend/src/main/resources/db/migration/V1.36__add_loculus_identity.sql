create table loculus_users (
    id uuid primary key,
    provisioned_at timestamp not null
);
comment on column loculus_users.provisioned_at is
    'UTC time this account was provisioned into Loculus, not its creation time at the identity provider.';

create table external_identities (
    issuer text not null,
    subject text not null,
    user_id uuid not null references loculus_users(id),
    preferred_username text,
    linked_at timestamp not null,
    constraint external_identities_issuer_subject_key primary key (issuer, subject)
);
create index external_identities_user_id_idx on external_identities(user_id);
comment on column external_identities.preferred_username is
    'Initial provider username snapshot; temporarily used for legacy group memberships. Not synchronized.';
