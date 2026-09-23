-- =========================================================
-- PERSONAL PROJECT ARCHIVE
-- SUPABASE DATABASE
-- =========================================================

create extension if not exists pgcrypto;


-- =========================================================
-- USER ID SEQUENCE
-- =========================================================

create sequence if not exists public.user_id_seq
    as bigint
    start with 1000000001
    increment by 1
    minvalue 1000000001
    maxvalue 9999999999;


-- =========================================================
-- PROFILES
-- =========================================================

create table if not exists public.profiles (

    id uuid primary key
        references auth.users(id)
        on delete cascade,

    user_id bigint unique not null
        default nextval(
            'public.user_id_seq'
        ),

    username text unique not null,

    email text,

    role text not null
        default 'user'
        check (
            role in (
                'admin',
                'user'
            )
        ),

    created_at timestamptz
        not null
        default now()
);


-- =========================================================
-- PROJECTS
-- =========================================================

create table if not exists public.projects (

    project_id text primary key,

    name text not null,

    description text
        default '',

    cover_path text,

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz
        not null
        default now()
);


-- =========================================================
-- FILES
-- =========================================================

create table if not exists public.files (

    id text primary key,

    project_id text not null
        references public.projects(project_id)
        on delete cascade,

    name text not null,

    size bigint
        not null
        default 0,

    mime_type text,

    storage_path text not null,

    created_at timestamptz
        not null
        default now()
);


-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles
enable row level security;

alter table public.projects
enable row level security;

alter table public.files
enable row level security;


-- =========================================================
-- ADMIN FUNCTION
-- =========================================================

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


-- =========================================================
-- NEW AUTH USER -> PROFILE
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$

declare

    generated_username text;

begin

    generated_username =
        lower(
            split_part(
                coalesce(
                    new.email,
                    'user'
                ),
                '@',
                1
            )
        );

    insert into public.profiles (
        id,
        username,
        email,
        role
    )

    values (
        new.id,
        generated_username,
        new.email,
        'user'
    )

    on conflict (id)
    do nothing;

    return new;

end;

$$;


drop trigger if exists
on_auth_user_created
on auth.users;


create trigger
on_auth_user_created

after insert
on auth.users

for each row

execute function
public.handle_new_user();


-- =========================================================
-- PROTECT PRIMARY ADMIN
-- =========================================================

create or replace function public.protect_primary_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$

begin

    if OLD.username = 'admin' then

        if NEW.username <> 'admin' then

            raise exception
                'Primary admin username cannot be changed.';

        end if;

        if NEW.role <> 'admin' then

            raise exception
                'Primary admin cannot be demoted.';

        end if;

        if NEW.user_id <> OLD.user_id then

            raise exception
                'Primary admin ID cannot be changed.';

        end if;

    end if;

    return NEW;

end;

$$;


drop trigger if exists
protect_primary_admin_trigger
on public.profiles;


create trigger
protect_primary_admin_trigger

before update
on public.profiles

for each row

execute function
public.protect_primary_admin();


-- =========================================================
-- PROFILE POLICIES
-- =========================================================

drop policy if exists
profiles_select
on public.profiles;


create policy
profiles_select

on public.profiles

for select

to authenticated

using (
    id = auth.uid()
    or public.is_admin()
);


drop policy if exists
profiles_update_admin
on public.profiles;


create policy
profiles_update_admin

on public.profiles

for update

to authenticated

using (
    public.is_admin()
)

with check (
    public.is_admin()
);


-- =========================================================
-- PROJECT POLICIES
-- =========================================================

drop policy if exists
projects_select
on public.projects;


create policy
projects_select

on public.projects

for select

to authenticated

using (true);


drop policy if exists
projects_insert_admin
on public.projects;


create policy
projects_insert_admin

on public.projects

for insert

to authenticated

with check (
    public.is_admin()
);


drop policy if exists
projects_update_admin
on public.projects;


create policy
projects_update_admin

on public.projects

for update

to authenticated

using (
    public.is_admin()
)

with check (
    public.is_admin()
);


drop policy if exists
projects_delete_admin
on public.projects;


create policy
projects_delete_admin

on public.projects

for delete

to authenticated

using (
    public.is_admin()
);


-- =========================================================
-- FILE POLICIES
-- =========================================================

drop policy if exists
files_select
on public.files;


create policy
files_select

on public.files

for select

to authenticated

using (true);


drop policy if exists
files_insert_admin
on public.files;


create policy
files_insert_admin

on public.files

for insert

to authenticated

with check (
    public.is_admin()
);


drop policy if exists
files_update_admin
on public.files;


create policy
files_update_admin

on public.files

for update

to authenticated

using (
    public.is_admin()
)

with check (
    public.is_admin()
);


drop policy if exists
files_delete_admin
on public.files;


create policy
files_delete_admin

on public.files

for delete

to authenticated

using (
    public.is_admin()
);


-- =========================================================
-- STORAGE BUCKET
-- =========================================================

insert into storage.buckets (
    id,
    name,
    public
)

values (
    'project-files',
    'project-files',
    false
)

on conflict (id)
do nothing;


-- =========================================================
-- STORAGE SELECT
-- Logged-in users can download project files.
-- =========================================================

drop policy if exists
project_files_read
on storage.objects;


create policy
project_files_read

on storage.objects

for select

to authenticated

using (
    bucket_id =
    'project-files'
);


-- =========================================================
-- STORAGE INSERT
-- Admin only.
-- =========================================================

drop policy if exists
project_files_upload
on storage.objects;


create policy
project_files_upload

on storage.objects

for insert

to authenticated

with check (
    bucket_id =
    'project-files'

    and

    public.is_admin()
);


-- =========================================================
-- STORAGE UPDATE
-- Admin only.
-- =========================================================

drop policy if exists
project_files_update
on storage.objects;


create policy
project_files_update

on storage.objects

for update

to authenticated

using (
    bucket_id =
    'project-files'

    and

    public.is_admin()
)

with check (
    bucket_id =
    'project-files'

    and

    public.is_admin()
);


-- =========================================================
-- STORAGE DELETE
-- Admin only.
-- =========================================================

drop policy if exists
project_files_delete
on storage.objects;


create policy
project_files_delete

on storage.objects

for delete

to authenticated

using (
    bucket_id =
    'project-files'

    and

    public.is_admin()
);


-- =========================================================
-- PRIMARY ADMIN
-- =========================================================
--
-- BEFORE RUNNING THIS SECTION:
--
-- Supabase Dashboard
-- Authentication
-- Users
-- Add user
--
-- Email:
-- admin@ppa.local
--
-- Password:
-- admin
--
-- Auto Confirm:
-- ON
--
-- =========================================================

do $$

declare

    admin_uuid uuid;

begin

    select id

    into admin_uuid

    from auth.users

    where email =
        'admin@ppa.local'

    limit 1;


    if admin_uuid is not null then

        insert into public.profiles (
            id,
            user_id,
            username,
            email,
            role
        )

        values (
            admin_uuid,
            1000000001,
            'admin',
            'admin@ppa.local',
            'admin'
        )

        on conflict (id)

        do update

        set
            username = 'admin',
            user_id = 1000000001,
            email = 'admin@ppa.local',
            role = 'admin';

    end if;

end;

$$;


-- =========================================================
-- VERIFY ADMIN
-- =========================================================

select

    user_id,
    username,
    email,
    role,
    created_at

from public.profiles

where username = 'admin';