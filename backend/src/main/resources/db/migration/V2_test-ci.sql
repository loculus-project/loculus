
create table groups_table (
    group_id serial primary key,
    group_name varchar(255),
    institution varchar(255) not null,
    address_line_1 varchar(255) not null,
    address_line_2 varchar(255),
    address_postal_code varchar(255) not null,
    address_city varchar(255) not null,
    address_state varchar(255),
    address_country varchar(255) not null,
    contact_email varchar(255) not null
);
