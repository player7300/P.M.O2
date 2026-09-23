-- ============================================================
-- PERSONAL PROJECT ARCHIVE
-- COMPLETE ADMIN SETUP
-- ============================================================
-- Admin account:
-- Email:    admin@ppa.local
-- Username: admin
--
-- IMPORTANT:
-- First create admin@ppa.local in:
-- Supabase -> Authentication -> Users
--
-- Then run this entire SQL file.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Required extension
-- ------------------------------------------------------------

create extension if not exists pgcrypto;


-- ------------------------------------------------------------
-- 2. Permanent User ID sequence
-- ------------------------------------------------------------

create sequence if not exists public.user_id_seq
    as bigint
    start with 1000000001
    increment by 1
    minvalue 1000000001
    maxvalue 9999999999;


-- ------------------------------------------------------------
-- 3. Profiles table
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- 4. Enable Row Level Security
-- ------------------------------------------------------------

alter table public.profiles enable row level security;


-- ------------------------------------------------------------
-- 5. Admin checking function
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- 6. Automatically create a profile
--    whenever a Supabase Auth user is created
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_username text;
begin

    new_username := lower(
        coalesce(
            new.raw_user_meta_data->>'username',
            split_part(coalesce(new.email, ''), '@', 1)
        )
    );

    if new_username is null or new_username = '' then
        new_username :=
            'user_' || substr(new.id::text, 1, 8);
    end if;

    insert into public.profiles (
        id,
        username,
        email,
        role
    )
    values (
        new.id,
        new_username,
        new.email,
        'user'
    )
    on conflict (id) do nothing;

    return new;

end;
$$;


-- ------------------------------------------------------------
-- 7. Create Auth -> Profiles trigger
-- ------------------------------------------------------------

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ------------------------------------------------------------
-- 8. Profile protection
--    User IDs can NEVER be changed.
--    Primary Admin cannot be demoted.
-- ------------------------------------------------------------

create or replace function public.protect_profile()
returns trigger
language plpgsql
as $$
begin

    -- Primary Admin protection
    if old.user_id = 1000000001 then

        if new.user_id <> old.user_id then
            raise exception
                'The primary Admin User ID cannot be changed';
        end if;

        if new.role <> 'admin' then
            raise exception
                'The primary Admin cannot be demoted';
        end if;

    end if;


    -- All User IDs are permanent
    if new.user_id <> old.user_id then
        raise exception
            'User ID is permanent and cannot be changed';
    end if;


    return new;

end;
$$;


-- ------------------------------------------------------------
-- 9. Create protection trigger
-- ------------------------------------------------------------

drop trigger if exists protect_profile_trigger
on public.profiles;

create trigger protect_profile_trigger
before update on public.profiles
for each row
execute function public.protect_profile();


-- ------------------------------------------------------------
-- 10. Remove old policies if they exist
-- ------------------------------------------------------------

drop policy if exists "profiles_select"
on public.profiles;

drop policy if exists "profiles_update_admin"
on public.profiles;


-- ------------------------------------------------------------
-- 11. Users can see their own profile.
--     Admin can see all profiles.
-- ------------------------------------------------------------

create policy "profiles_select"
on public.profiles
for select
to authenticated
using (
    id = auth.uid()
    or public.is_admin()
);


-- ------------------------------------------------------------
-- 12. Admin can change user roles
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- 13. Find the Admin Auth account
-- ------------------------------------------------------------

do $$
declare
    admin_uuid uuid;
begin

    select id
    into admin_uuid
    from auth.users
    where lower(email) = 'admin@ppa.local'
    limit 1;


    -- Stop if Admin account does not exist
    if admin_uuid is null then

        raise exception
        'Admin account not found. First create admin@ppa.local in Supabase Authentication -> Users.';

    end if;


    -- --------------------------------------------------------
    -- 14. Create profile if it does not exist
    -- --------------------------------------------------------

    insert into public.profiles (
        id,
        username,
        email,
        role
    )
    values (
        admin_uuid,
        'admin',
        'admin@ppa.local',
        'admin'
    )
    on conflict (id)
    do update set
        username = 'admin',
        email = 'admin@ppa.local',
        role = 'admin';


    -- --------------------------------------------------------
    -- 15. Make sure username is admin
    -- --------------------------------------------------------

    update public.profiles
    set
        username = 'admin',
        email = 'admin@ppa.local',
        role = 'admin'
    where id = admin_uuid;

end;
$$;


-- ------------------------------------------------------------
-- 16. Verify Admin
-- ------------------------------------------------------------

select
    p.id,
    p.user_id,
    p.username,
    p.email,
    p.role,
    p.created_at
from public.profiles p
join auth.users u
    on u.id = p.id
where lower(u.email) = 'admin@ppa.local';


-- ============================================================
-- EXPECTED RESULT
-- ============================================================
--
-- username : admin
-- email    : admin@ppa.local
-- role     : admin
-- user_id  : 1000000001
--
-- Then login to the website with:
--
-- Username: admin
-- Password: admin
--
-- ============================================================