-- People are just people. No spouse_id, no parent_id, no family_id pointers.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  first_name text not null,
  last_name text,
  birth_date date,
  death_date date,
  gender text,
  managed_by uuid references people(id),
  created_at timestamptz default now()
);

create index if not exists people_family_id_idx on people (family_id);

-- Every relationship is an explicit, typed edge.
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  from_person uuid not null references people(id) on delete cascade,
  to_person   uuid not null references people(id) on delete cascade,
  type text not null check (type in (
    'biological_parent',
    'adoptive_parent',
    'step_parent',
    'spouse',
    'ex_spouse',
    'partner'
  )),
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  constraint no_self_relationship check (from_person <> to_person),
  constraint unique_edge unique (from_person, to_person, type)
);

create index if not exists relationships_from_idx on relationships (from_person, type);
create index if not exists relationships_to_idx on relationships (to_person, type);
create index if not exists relationships_family_idx on relationships (family_id);
