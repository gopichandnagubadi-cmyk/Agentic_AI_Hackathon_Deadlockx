create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    role text not null default 'citizen' check (role in ('citizen', 'officer', 'contractor')),
    full_name text,
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, role)
    values (new.id, 'citizen')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

create table if not exists public.complaints (
    id uuid primary key default gen_random_uuid(),
    complaint_id text not null unique,
    user_id uuid references auth.users(id) on delete set null,
    image_url text,
    latitude double precision not null,
    longitude double precision not null,
    accuracy double precision,
    notes text,
    status text not null default 'Reported',
    created_at timestamptz not null default now()
);

alter table public.complaints add column if not exists complaint_id text;
alter table public.complaints add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.complaints add column if not exists image_url text;
alter table public.complaints add column if not exists latitude double precision;
alter table public.complaints add column if not exists longitude double precision;
alter table public.complaints add column if not exists accuracy double precision;
alter table public.complaints add column if not exists notes text;
alter table public.complaints add column if not exists status text default 'Reported';
alter table public.complaints add column if not exists created_at timestamptz default now();

create unique index if not exists complaints_complaint_id_key on public.complaints (complaint_id);

create table if not exists public.work_orders (
    id uuid primary key default gen_random_uuid(),
    work_order_id text not null unique,
    complaint_id text not null references public.complaints(complaint_id) on delete cascade,
    contractor_id uuid references auth.users(id) on delete set null,
    status text not null default 'Assigned',
    evidence_before_url text,
    evidence_after_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.drainage (
    id uuid primary key default gen_random_uuid(),
    latitude double precision not null,
    longitude double precision not null,
    type text not null,
    risk text not null default 'Medium',
    created_at timestamptz not null default now()
);

create table if not exists public.waterlogging (
    id uuid primary key default gen_random_uuid(),
    latitude double precision not null,
    longitude double precision not null,
    type text not null,
    risk text not null default 'Medium',
    created_at timestamptz not null default now()
);

create index if not exists complaints_user_id_idx on public.complaints (user_id);
create index if not exists complaints_status_idx on public.complaints (status);
create index if not exists work_orders_complaint_id_idx on public.work_orders (complaint_id);
create index if not exists work_orders_contractor_id_idx on public.work_orders (contractor_id);

alter table public.profiles enable row level security;
alter table public.complaints enable row level security;
alter table public.work_orders enable row level security;
alter table public.drainage enable row level security;
alter table public.waterlogging enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists complaints_select_access on public.complaints;
create policy complaints_select_access on public.complaints for select to authenticated
using (
    user_id = auth.uid()
    or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('officer', 'contractor')
    )
);

drop policy if exists complaints_insert_own on public.complaints;
create policy complaints_insert_own on public.complaints for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists complaints_update_access on public.complaints;
create policy complaints_update_access on public.complaints for update to authenticated
using (
    user_id = auth.uid()
    or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('officer', 'contractor')
    )
);

drop policy if exists work_orders_select_access on public.work_orders;
create policy work_orders_select_access on public.work_orders for select to authenticated
using (
    contractor_id = auth.uid()
    or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('officer', 'contractor')
    )
);

drop policy if exists work_orders_insert_officer on public.work_orders;
create policy work_orders_insert_officer on public.work_orders for insert to authenticated
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'officer'));

drop policy if exists work_orders_update_access on public.work_orders;
create policy work_orders_update_access on public.work_orders for update to authenticated
using (
    contractor_id = auth.uid()
    or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role = 'officer'
    )
);

drop policy if exists drainage_select_authenticated on public.drainage;
create policy drainage_select_authenticated on public.drainage for select to authenticated using (true);

drop policy if exists waterlogging_select_authenticated on public.waterlogging;
create policy waterlogging_select_authenticated on public.waterlogging for select to authenticated using (true);

insert into public.drainage (latitude, longitude, type, risk)
select 16.12380, 80.12390, 'Main Drain', 'High'
where not exists (select 1 from public.drainage);

insert into public.waterlogging (latitude, longitude, type, risk)
select 16.12420, 80.12450, 'Waterlogging Hotspot', 'High'
where not exists (select 1 from public.waterlogging);
