create table auth_codes (
    id uuid primary key,
    email varchar(160) not null,
    purpose varchar(40) not null,
    code_hash varchar(120) not null,
    expires_at timestamp not null,
    used_at timestamp,
    created_at timestamp not null
);

create index idx_auth_codes_email_purpose_created on auth_codes(email, purpose, created_at desc);
