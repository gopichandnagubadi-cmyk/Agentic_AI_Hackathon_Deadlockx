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

create or replace function public.is_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid()
        and role = required_role
    );
$$;

revoke all on function public.is_role(text) from public;
grant execute on function public.is_role(text) to authenticated;

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
alter table public.complaints add column if not exists defect_type text;
alter table public.complaints add column if not exists severity text;
alter table public.complaints add column if not exists priority integer;
alter table public.complaints add column if not exists water_risk text;
alter table public.complaints add column if not exists drainage_nearby boolean;
alter table public.complaints add column if not exists analyzed_at timestamptz;
alter table public.complaints add column if not exists updated_at timestamptz default now();

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

-- Existing installations may have created work_orders.complaint_id as uuid.
-- Complaint IDs in this application are human-readable text values such as CR-123456.
do $$
declare
    complaint_id_type text;
begin
    select data_type into complaint_id_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_orders'
      and column_name = 'complaint_id';

    if complaint_id_type = 'uuid' then
        alter table public.work_orders
            drop constraint if exists work_orders_complaint_id_fkey;
        alter table public.work_orders
            alter column complaint_id type text using complaint_id::text;
        update public.work_orders as work_order
        set complaint_id = complaint.complaint_id
        from public.complaints as complaint
        where work_order.complaint_id = complaint.id::text;
    end if;
end;
$$;

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

create table if not exists public.status_history (
    id uuid primary key default gen_random_uuid(),
    complaint_id text references public.complaints(complaint_id) on delete cascade,
    work_order_id uuid references public.work_orders(id) on delete cascade,
    from_status text,
    to_status text not null,
    changed_by uuid not null default auth.uid() references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    check (complaint_id is not null or work_order_id is not null)
);

do $$
declare
    complaint_id_type text;
begin
    select data_type into complaint_id_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'status_history'
      and column_name = 'complaint_id';

    if complaint_id_type = 'uuid' then
        alter table public.status_history
            drop constraint if exists status_history_complaint_id_fkey;
        alter table public.status_history
            alter column complaint_id type text using complaint_id::text;
        update public.status_history as history
        set complaint_id = complaint.complaint_id
        from public.complaints as complaint
        where history.complaint_id = complaint.id::text;
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'work_orders_complaint_id_fkey'
          and conrelid = 'public.work_orders'::regclass
    ) then
        alter table public.work_orders
            add constraint work_orders_complaint_id_fkey
            foreign key (complaint_id) references public.complaints(complaint_id)
            on delete cascade;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'status_history_complaint_id_fkey'
          and conrelid = 'public.status_history'::regclass
    ) then
        alter table public.status_history
            add constraint status_history_complaint_id_fkey
            foreign key (complaint_id) references public.complaints(complaint_id)
            on delete cascade;
    end if;
end;
$$;

create index if not exists complaints_user_id_idx on public.complaints (user_id);
create index if not exists complaints_status_idx on public.complaints (status);
create index if not exists work_orders_complaint_id_idx on public.work_orders (complaint_id);
create index if not exists work_orders_contractor_id_idx on public.work_orders (contractor_id);
create index if not exists status_history_complaint_id_idx on public.status_history (complaint_id);
create index if not exists status_history_work_order_id_idx on public.status_history (work_order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at
    before update on public.complaints
    for each row execute procedure public.set_updated_at();

drop trigger if exists work_orders_set_updated_at on public.work_orders;
create trigger work_orders_set_updated_at
    before update on public.work_orders
    for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.complaints enable row level security;
alter table public.work_orders enable row level security;
alter table public.drainage enable row level security;
alter table public.waterlogging enable row level security;
alter table public.status_history enable row level security;

insert into storage.buckets (id, name, public)
values ('road-evidence', 'road-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_select_officer on public.profiles;
create policy profiles_select_officer on public.profiles for select to authenticated
using (public.is_role('officer'));

drop policy if exists complaints_select_access on public.complaints;
create policy complaints_select_access on public.complaints for select to authenticated
using (
    user_id = auth.uid()
    or public.is_role('officer')
    or exists (
        select 1
        from public.work_orders
        where work_orders.complaint_id = complaints.complaint_id
        and work_orders.contractor_id = auth.uid()
    )
);

drop policy if exists complaints_insert_own on public.complaints;
create policy complaints_insert_own on public.complaints for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists complaints_update_access on public.complaints;
create policy complaints_update_access on public.complaints for update to authenticated
using (public.is_role('officer'));

drop policy if exists work_orders_select_access on public.work_orders;
create policy work_orders_select_access on public.work_orders for select to authenticated
using (
    contractor_id = auth.uid()
    or public.is_role('officer')
);

drop policy if exists work_orders_insert_officer on public.work_orders;
create policy work_orders_insert_officer on public.work_orders for insert to authenticated
with check (public.is_role('officer'));

drop policy if exists work_orders_update_access on public.work_orders;
create policy work_orders_update_access on public.work_orders for update to authenticated
using (
    contractor_id = auth.uid()
    or public.is_role('officer')
);

drop policy if exists drainage_select_authenticated on public.drainage;
create policy drainage_select_authenticated on public.drainage for select to authenticated using (true);

drop policy if exists waterlogging_select_authenticated on public.waterlogging;
create policy waterlogging_select_authenticated on public.waterlogging for select to authenticated using (true);

drop policy if exists status_history_select_access on public.status_history;
create policy status_history_select_access on public.status_history for select to authenticated
using (
    public.is_role('officer')
    or exists (
        select 1 from public.complaints
        where complaints.complaint_id = status_history.complaint_id
        and complaints.user_id = auth.uid()
    )
);

drop policy if exists storage_evidence_insert on storage.objects;
create policy storage_evidence_insert on storage.objects
for insert to authenticated
 with check (bucket_id = 'road-evidence' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists storage_evidence_select on storage.objects;
create policy storage_evidence_select on storage.objects
for select to authenticated
using (
    bucket_id = 'road-evidence'
    and (
    (storage.foldername(name))[2] = auth.uid()::text
        or public.is_role('officer')
    )
);

drop policy if exists storage_evidence_update on storage.objects;
create policy storage_evidence_update on storage.objects
for update to authenticated
using (
    bucket_id = 'road-evidence'
    and (
        (storage.foldername(name))[2] = auth.uid()::text
        or public.is_role('officer')
    )
);

create or replace function public.transition_complaint(
    target_complaint_id text,
    next_status text
)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
    current_record public.complaints;
    result_record public.complaints;
    allowed boolean;
begin
    select * into current_record
    from public.complaints
    where complaint_id = target_complaint_id
    for update;

    if current_record.id is null then
        raise exception 'Complaint not found';
    end if;

    allowed :=
        (next_status = 'Analyzed' and exists (select 1 from public.profiles where id = auth.uid() and role = 'citizen') and current_record.user_id = auth.uid())
        or (next_status in ('Work Order Created', 'Contractor Assigned', 'Closed') and exists (select 1 from public.profiles where id = auth.uid() and role = 'officer'))
        or (next_status in ('In Progress', 'Repair Completed') and exists (select 1 from public.work_orders where complaint_id = target_complaint_id and contractor_id = auth.uid()));

    if not allowed then
        raise exception 'You are not allowed to make this status transition';
    end if;

    update public.complaints
    set status = next_status,
        analyzed_at = case when next_status = 'Analyzed' then now() else analyzed_at end
    where complaint_id = target_complaint_id
    returning * into result_record;

    insert into public.status_history (complaint_id, from_status, to_status)
    values (target_complaint_id, current_record.status, next_status);

    return result_record;
end;
$$;

revoke all on function public.transition_complaint(text, text) from public;
grant execute on function public.transition_complaint(text, text) to authenticated;

create or replace function public.save_complaint_analysis(
    target_complaint_id text,
    target_defect_type text,
    target_severity text,
    target_priority integer,
    target_water_risk text,
    target_drainage_nearby boolean
)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare result_record public.complaints;
begin
    update public.complaints
    set defect_type = target_defect_type,
        severity = target_severity,
        priority = target_priority,
        water_risk = target_water_risk,
        drainage_nearby = target_drainage_nearby,
        analyzed_at = now(),
        status = 'Analyzed'
    where complaint_id = target_complaint_id
      and user_id = auth.uid()
    returning * into result_record;

    if result_record.id is null then
        raise exception 'Complaint not found or not owned by current user';
    end if;

    return result_record;
end;
$$;

revoke all on function public.save_complaint_analysis(text, text, text, integer, text, boolean) from public;
grant execute on function public.save_complaint_analysis(text, text, text, integer, text, boolean) to authenticated;

create or replace function public.transition_work_order(
    target_work_order_id uuid,
    next_status text
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    current_record public.work_orders;
    result_record public.work_orders;
    allowed boolean;
begin
    select * into current_record
    from public.work_orders
    where id = target_work_order_id
    for update;

    if current_record.id is null then
        raise exception 'Work order not found';
    end if;

    allowed :=
        (next_status in ('Accepted', 'In Progress', 'Repair Completed', 'Reopened') and current_record.contractor_id = auth.uid())
        or (next_status in ('Assigned', 'Verified', 'Rejected') and exists (select 1 from public.profiles where id = auth.uid() and role = 'officer'));

    if not allowed then
        raise exception 'You are not allowed to make this work-order transition';
    end if;

    update public.work_orders
    set status = next_status
    where id = target_work_order_id
    returning * into result_record;

    insert into public.status_history (work_order_id, from_status, to_status)
    values (target_work_order_id, current_record.status, next_status);

    return result_record;
end;
$$;

revoke all on function public.transition_work_order(uuid, text) from public;
grant execute on function public.transition_work_order(uuid, text) to authenticated;

create or replace function public.create_work_order_for_complaint(
    target_complaint_id text
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    result_record public.work_orders;
    previous_status text;
begin
    if not public.is_role('officer') then
        raise exception 'Only officers can create work orders';
    end if;

    select status into previous_status
    from public.complaints
    where complaint_id = target_complaint_id
    for update;

    if previous_status is null then
        raise exception 'Complaint not found';
    end if;

    insert into public.work_orders (work_order_id, complaint_id, status)
    values ('WO-' || right(replace(gen_random_uuid()::text, '-', ''), 8), target_complaint_id, 'Assigned')
    returning * into result_record;

    update public.complaints
    set status = 'Work Order Created'
    where complaint_id = target_complaint_id;

    insert into public.status_history (complaint_id, from_status, to_status)
    values (target_complaint_id, previous_status, 'Work Order Created');

    return result_record;
end;
$$;

revoke all on function public.create_work_order_for_complaint(text) from public;
grant execute on function public.create_work_order_for_complaint(text) to authenticated;

create or replace function public.assign_work_order(
    target_work_order_id uuid,
    target_contractor_id uuid
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare result_record public.work_orders;
begin
    if not public.is_role('officer') then
        raise exception 'Only officers can assign work orders';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = target_contractor_id
        and role = 'contractor'
    ) then
        raise exception 'Target user is not a contractor';
    end if;

    update public.work_orders
    set contractor_id = target_contractor_id,
        status = 'Assigned'
    where id = target_work_order_id
    returning * into result_record;

    if result_record.id is null then
        raise exception 'Work order not found';
    end if;

    return result_record;
end;
$$;

revoke all on function public.assign_work_order(uuid, uuid) from public;
grant execute on function public.assign_work_order(uuid, uuid) to authenticated;

insert into public.drainage (latitude, longitude, type, risk)
select 16.12380, 80.12390, 'Main Drain', 'High'
where not exists (select 1 from public.drainage);

insert into public.waterlogging (latitude, longitude, type, risk)
select 16.12420, 80.12450, 'Waterlogging Hotspot', 'High'
where not exists (select 1 from public.waterlogging);
