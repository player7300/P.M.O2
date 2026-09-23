-- =========================================================
-- PERSONAL PROJECT ARCHIVE
-- SUPABASE DATABASE SCHEMA
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- 1. USER ID SEQUENCE
-- Permanent 10-digit numeric IDs
-- =========================================================

create sequence if not exists public.user_id_seq
    as bigint
    start with 1000000001
    increment by 1
    minvalue 1000000001
    maxvalue 9999999999;


-- =========================================================
-- 2. PROFILES
-- =========================================================

create table if not exists public.profiles (
    id uuid primary key
        references auth.users(id)
        on delete cascade,

    user_id bigint unique not null
        default nextval('public.user_id_seq'),

    username text unique not null,

    email text,

    role text not null default 'user'
        check (role in ('admin', 'user')),

    created_at timestamptz not null default now()
);


-- =========================================================
-- 3. PROJECTS
-- =========================================================

create table if not exists public.projects (
    project_id text primary key,

    name text not null,

    description text default '',

    cover_path text,

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now()
);


-- =========================================================
-- 4. FILES
-- =========================================================

create table if not exists public.files (
    id text primary key,

    project_id text not null
        references public.projects(project_id)
        on delete cascade,

    name text not null,

    size bigint not null default 0,

    mime_type text,

    storage_path text not null,

    created_at timestamptz not null default now()
);


-- =========================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.files enable row level security;


-- =========================================================
-- 6. ADMIN CHECK FUNCTION
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
-- 7. AUTOMATIC PROFILE CREATION
-- When a Supabase Auth user is created,
-- automatically create a profile.
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

    generated_username :=
        lower(
            split_part(
                coalesce(new.email, 'user'),
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
    on conflict (id) do nothing;

    return new;
end;
$$;


drop trigger if exists on_auth_user_created
on auth.users;


create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- =========================================================
-- 8. PROTECT PRIMARY ADMIN
-- Prevent changing the primary admin's role or user ID.
-- =========================================================

create or replace function public.protect_primary_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

    if OLD.username = 'admin' then

        if NEW.role <> 'admin' then
            raise exception 'The primary admin cannot be demoted.';
        end if;

        if NEW.user_id <> OLD.user_id then
            raise exception 'The primary admin user ID cannot be changed.';
        end if;

        if NEW.username <> 'admin' then
            raise exception 'The primary admin username cannot be changed.';
        end if;

    end if;

    return NEW;
end;
$$;


drop trigger if exists protect_primary_admin_trigger
on public.profiles;


create trigger protect_primary_admin_trigger
before update on public.profiles
for each row
execute function public.protect_primary_admin();


-- =========================================================
-- 9. PROFILE POLICIES
-- =========================================================

drop policy if exists "profiles_select"
on public.profiles;

create policy "profiles_select"
on public.profiles
for select
to authenticated
using (
    id = auth.uid()
    or public.is_admin()
);


drop policy if exists "profiles_update_admin"
on public.profiles;

create policy "profiles_update_admin"
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
-- 10. PROJECT POLICIES
-- =========================================================

drop policy if exists "projects_select"
on public.projects;

create policy "projects_select"
on public.projects
for select
to authenticated
using (true);


drop policy if exists "projects_insert_admin"
on public.projects;

create policy "projects_insert_admin"
on public.projects
for insert
to authenticated
with check (
    public.is_admin()
);


drop policy if exists "projects_update_admin"
on public.projects;

create policy "projects_update_admin"
on public.projects
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


drop policy if exists "projects_delete_admin"
on public.projects;

create policy "projects_delete_admin"
on public.projects
for delete
to authenticated
using (
    public.is_admin()
);


-- =========================================================
-- 11. FILE POLICIES
-- =========================================================

drop policy if exists "files_select"
on public.files;

create policy "files_select"
on public.files
for select
to authenticated
using (true);


drop policy if exists "files_insert_admin"
on public.files;

create policy "files_insert_admin"
on public.files
for insert
to authenticated
with check (
    public.is_admin()
);


drop policy if exists "files_update_admin"
on public.files;

create policy "files_update_admin"
on public.files
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);


drop policy if exists "files_delete_admin"
on public.files;

create policy "files_delete_admin"
on public.files
for delete
to authenticated
using (
    public.is_admin()
);


-- =========================================================
-- 12. STORAGE BUCKET
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
on conflict (id) do nothing;


-- =========================================================
-- 13. STORAGE POLICIES
-- =========================================================

drop policy if exists "project_files_read"
on storage.objects;

create policy "project_files_read"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'project-files'
);


drop policy if exists "project_files_upload"
on storage.objects;

create policy "project_files_upload"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'project-files'
    and public.is_admin()
);


drop policy if exists "project_files_update"
on storage.objects;

create policy "project_files_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'project-files'
    and public.is_admin()
)
with check (
    bucket_id = 'project-files'
    and public.is_admin()
);


drop policy if exists "project_files_delete"
on storage.objects;

create policy "project_files_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'project-files'
    and public.is_admin()
);


-- =========================================================
-- 14. MAKE admin@ppa.local THE PRIMARY ADMIN
-- =========================================================
--
-- IMPORTANT:
-- First create this user in:
--
-- Supabase
-- → Authentication
-- → Users
-- → Add user
--
-- Email:
-- admin@ppa.local
--
-- Password:
-- admin
--
-- Auto Confirm User:
-- ON
--
-- Then this section will make the account an admin.
-- =========================================================

do $$
declare
    admin_uuid uuid;
begin

    select id
    into admin_uuid
    from auth.users
    where email = 'admin@ppa.local'
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
        on conflict (id) do update
        set
            username = 'admin',
            email = 'admin@ppa.local',
            role = 'admin';

    end if;

end
$$;


-- =========================================================
-- 15. FORCE PRIMARY ADMIN ID
-- =========================================================

update public.profiles
set
    user_id = 1000000001,
    username = 'admin',
    role = 'admin',
    email = 'admin@ppa.local'
where id = (
    select id
    from auth.users
    where email = 'admin@ppa.local'
    limit 1
);


-- =========================================================
-- 16. VERIFY ADMIN
-- =========================================================

select
    p.id,
    p.user_id,
    p.username,
    p.email,
    p.role,
    p.created_at
from public.profiles p
where p.username = 'admin';


-- =========================================================
-- END
-- =========================================================