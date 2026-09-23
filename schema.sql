-- schema.sql

create extension if not exists pgcrypto;


/* =========================================================
   USER ID SEQUENCE
========================================================= */

create sequence if not exists public.user_id_seq
  as bigint
  start with 1000000001
  increment by 1
  minvalue 1000000001
  maxvalue 9999999999;


/* =========================================================
   PROFILES
========================================================= */

create table if not exists public.profiles (

  id uuid primary key
    references auth.users(id)
    on delete cascade,

  user_id bigint unique not null
    default nextval('public.user_id_seq'),

  username text unique not null,

  email text,

  role text not null default 'user'
    check (role in ('admin','user')),

  created_at timestamptz
    not null default now()
);


/* =========================================================
   PROJECTS
========================================================= */

create table if not exists public.projects (

  project_id text primary key,

  name text not null,

  description text default '',

  cover_path text,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now()
);


/* =========================================================
   FILES
========================================================= */

create table if not exists public.files (

  id text primary key,

  project_id text not null
    references public.projects(project_id)
    on delete cascade,

  name text not null,

  size bigint default 0,

  mime_type text,

  storage_path text not null,

  created_at timestamptz
    not null default now()
);


/* =========================================================
   ENABLE RLS
========================================================= */

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.files enable row level security;


/* =========================================================
   ADMIN CHECK
========================================================= */

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$

  select exists (

    select 1

    from public.profiles

    where id = auth.uid()

      and role = 'admin'

  );

$$;


/* =========================================================
   AUTOMATIC PROFILE CREATION
========================================================= */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$

declare
  generated_username text;

begin

  generated_username :=
    lower(
      split_part(
        coalesce(new.email, ''),
        '@',
        1
      )
    );

  if generated_username is null
     or generated_username = '' then

    generated_username :=
      'user_' ||
      replace(
        new.id::text,
        '-',
        ''
      );

  end if;

  insert into public.profiles(
    id,
    username,
    email
  )

  values(
    new.id,
    generated_username,
    new.email
  );

  return new;

end;

$$;


drop trigger if exists
on_auth_user_created
on auth.users;


create trigger
on_auth_user_created

after insert on auth.users

for each row

execute function
public.handle_new_user();


/* =========================================================
   PROTECT PRIMARY ADMIN
========================================================= */

create or replace function
public.protect_primary_admin()

returns trigger
language plpgsql
as $$

begin

  if OLD.user_id = 1000000001 then

    if NEW.user_id <> OLD.user_id
       or NEW.role <> 'admin' then

      raise exception
        'The primary administrator cannot be modified.';

    end if;

  end if;

  if NEW.user_id <> OLD.user_id then

    raise exception
      'User IDs cannot be changed.';

  end if;

  return NEW;

end;

$$;


drop trigger if exists
protect_primary_admin_trigger
on public.profiles;


create trigger
protect_primary_admin_trigger

before update on public.profiles

for each row

execute function
public.protect_primary_admin();


/* =========================================================
   REMOVE OLD POLICIES
========================================================= */

drop policy if exists
"profile_select"
on public.profiles;

drop policy if exists
"profile_update_admin"
on public.profiles;

drop policy if exists
"projects_select"
on public.projects;

drop policy if exists
"projects_insert_admin"
on public.projects;

drop policy if exists
"projects_delete_admin"
on public.projects;

drop policy if exists
"files_select"
on public.files;

drop policy if exists
"files_insert_admin"
on public.files;

drop policy if exists
"files_delete_admin"
on public.files;


/* =========================================================
   PROFILE POLICIES
========================================================= */

create policy
"profile_select"

on public.profiles

for select

to authenticated

using (

  id = auth.uid()
  or
  public.is_admin()

);


create policy
"profile_update_admin"

on public.profiles

for update

to authenticated

using (
  public.is_admin()
)

with check (
  public.is_admin()
);


/* =========================================================
   PROJECT POLICIES
========================================================= */

create policy
"projects_select"

on public.projects

for select

to authenticated

using (true);


create policy
"projects_insert_admin"

on public.projects

for insert

to authenticated

with check (
  public.is_admin()
);


create policy
"projects_delete_admin"

on public.projects

for delete

to authenticated

using (
  public.is_admin()
);


/* =========================================================
   FILE POLICIES
========================================================= */

create policy
"files_select"

on public.files

for select

to authenticated

using (true);


create policy
"files_insert_admin"

on public.files

for insert

to authenticated

with check (
  public.is_admin()
);


create policy
"files_delete_admin"

on public.files

for delete

to authenticated

using (
  public.is_admin()
);


/* =========================================================
   PRIVATE STORAGE BUCKET
========================================================= */

insert into storage.buckets(
  id,
  name,
  public
)

values(
  'project-files',
  'project-files',
  false
)

on conflict(id)

do update set
  public = false;


/* =========================================================
   STORAGE POLICIES
========================================================= */

drop policy if exists
"project_storage_select"
on storage.objects;

drop policy if exists
"project_storage_insert"
on storage.objects;

drop policy if exists
"project_storage_delete"
on storage.objects;


create policy
"project_storage_select"

on storage.objects

for select

to authenticated

using (
  bucket_id = 'project-files'
);


create policy
"project_storage_insert"

on storage.objects

for insert

to authenticated

with check (
  bucket_id = 'project-files'
  and
  public.is_admin()
);


create policy
"project_storage_delete"

on storage.objects

for delete

to authenticated

using (
  bucket_id = 'project-files'
  and
  public.is_admin()
);


/* =========================================================
   FIRST ADMIN
=========================================================

   1. In Supabase:
      Authentication
      -> Users
      -> Add user

   Email:
      admin@ppa.local

   Password:
      YOUR_ADMIN_PASSWORD

   Make sure the user is confirmed.

   2. Then run:

   update public.profiles
   set role = 'admin'
   where user_id = 1000000001;

*/