alter table user_groups_table
    add column user_id uuid references loculus_users(id),
    add constraint user_groups_user_id_group_id_key unique (user_id, group_id);

comment on column user_groups_table.user_id is
    'Loculus identity link. Nullable during the additive backfill; legacy v0 reads still use user_name.';
