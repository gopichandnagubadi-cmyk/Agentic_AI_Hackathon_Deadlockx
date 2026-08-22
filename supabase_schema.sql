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
        and lower(trim(role)) = lower(trim(required_role))
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
alter table public.complaints add column if not exists nearest_drainage_distance_m double precision;
alter table public.complaints add column if not exists spatial_correlation boolean;
alter table public.complaints add column if not exists location_name text;
alter table public.complaints add column if not exists analyzed_at timestamptz;
alter table public.complaints add column if not exists updated_at timestamptz default now();

create unique index if not exists complaints_complaint_id_key on public.complaints (complaint_id);

create table if not exists public.work_orders (
    id uuid primary key default gen_random_uuid(),
    work_order_id text not null unique,
    work_order_number text not null unique,
    complaint_id text not null references public.complaints(complaint_id) on delete cascade,
    contractor_id uuid references auth.users(id) on delete set null,
    status text not null default 'Assigned',
    evidence_before_url text,
    evidence_after_url text,
    repair_latitude double precision,
    repair_longitude double precision,
    repair_accuracy double precision,
    repair_captured_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Bring older installations up to the current work-order contract.
alter table public.work_orders add column if not exists work_order_id text;
alter table public.work_orders add column if not exists work_order_number text;
alter table public.work_orders add column if not exists complaint_id text;
alter table public.work_orders add column if not exists contractor_id uuid;
alter table public.work_orders add column if not exists status text default 'Assigned';
alter table public.work_orders add column if not exists evidence_before_url text;
alter table public.work_orders add column if not exists evidence_after_url text;
alter table public.work_orders add column if not exists repair_latitude double precision;
alter table public.work_orders add column if not exists repair_longitude double precision;
alter table public.work_orders add column if not exists repair_accuracy double precision;
alter table public.work_orders add column if not exists repair_captured_at timestamptz;
alter table public.work_orders add column if not exists created_at timestamptz default now();
alter table public.work_orders add column if not exists updated_at timestamptz default now();

update public.work_orders
set work_order_id = 'WO-' || right(replace(gen_random_uuid()::text, '-', ''), 8)
where work_order_id is null;

update public.work_orders
set work_order_number = work_order_id
where work_order_number is null;

alter table public.work_orders alter column work_order_id set not null;
alter table public.work_orders alter column work_order_number set not null;
create unique index if not exists work_orders_work_order_id_key
    on public.work_orders (work_order_id);
create unique index if not exists work_orders_work_order_number_key
    on public.work_orders (work_order_number);

-- Existing installations may point contractor_id at a different contractor table.
-- The application selects contractors from profiles, whose IDs are auth user IDs.
alter table public.work_orders
    drop constraint if exists work_orders_contractor_id_fkey;
alter table public.work_orders
    add constraint work_orders_contractor_id_fkey
    foreign key (contractor_id) references public.profiles(id)
    on delete set null
    not valid;

-- Normalize common legacy status values before enforcing the current lifecycle.
update public.work_orders
set status = case lower(trim(status))
    when 'pending' then 'Assigned'
    when 'assigned' then 'Assigned'
    when 'accepted' then 'Accepted'
    when 'in_progress' then 'In Progress'
    when 'in-progress' then 'In Progress'
    when 'in progress' then 'In Progress'
    when 'completed' then 'Completed Awaiting Verification'
    when 'repair completed' then 'Completed Awaiting Verification'
    when 'completed awaiting verification' then 'Completed Awaiting Verification'
    when 'reopened' then 'Reopened'
    when 'verified' then 'Closed'
    when 'closed' then 'Closed'
    else status
end
where status is not null;

alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders
    add constraint work_orders_status_check
    check (status in (
        'Assigned',
        'Accepted',
        'In Progress',
        'Completed Awaiting Verification',
        'Reopened',
        'Closed'
    )) not valid;

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
 with check (
    bucket_id = 'road-evidence'
    and (
        (storage.foldername(name))[2] = auth.uid()::text
        or (
            (storage.foldername(name))[1] = 'complaints'
            and exists (
                select 1 from public.complaints
                where complaints.complaint_id = (storage.foldername(name))[2]
                and complaints.user_id = auth.uid()
            )
        )
    )
 );

drop policy if exists storage_evidence_select on storage.objects;
create policy storage_evidence_select on storage.objects
for select to authenticated
using (
    bucket_id = 'road-evidence'
    and (
    (storage.foldername(name))[2] = auth.uid()::text
        or (
            (storage.foldername(name))[1] = 'complaints'
            and exists (
                select 1 from public.complaints
                where complaints.complaint_id = (storage.foldername(name))[2]
                and complaints.user_id = auth.uid()
            )
        )
        or public.is_role('officer')
        or (
            (storage.foldername(name))[1] = 'complaints'
            and exists (
                select 1
                from public.work_orders
                where work_orders.complaint_id = split_part(storage.filename(name), '.', 1)
                and work_orders.contractor_id = auth.uid()
            )
        )
    )
);

drop policy if exists storage_evidence_update on storage.objects;
create policy storage_evidence_update on storage.objects
for update to authenticated
using (
    bucket_id = 'road-evidence'
    and (
        (storage.foldername(name))[2] = auth.uid()::text
        or (
            (storage.foldername(name))[1] = 'complaints'
            and exists (
                select 1 from public.complaints
                where complaints.complaint_id = (storage.foldername(name))[2]
                and complaints.user_id = auth.uid()
            )
        )
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
        (next_status = 'Under Review' and current_record.status = 'Reported' and public.is_role('officer'))
        or (next_status = 'Verified' and current_record.status in ('Reported', 'Under Review', 'Analyzed') and public.is_role('officer'))
        or (next_status = 'Work Order Created' and current_record.status = 'Verified' and public.is_role('officer'))
        or (next_status = 'Contractor Assigned' and current_record.status = 'Work Order Created' and public.is_role('officer'))
        or (next_status = 'Closed' and current_record.status in ('Completed Awaiting Verification', 'Verified') and public.is_role('officer'))
        or (next_status = 'Reopened' and current_record.status in ('Closed', 'Completed Awaiting Verification') and public.is_role('officer'));

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
declare
    result_record public.complaints;
    previous_status text;
    nearest_distance double precision;
    nearby_water_risk text;
    calculated_priority integer;
begin
        select status into previous_status
        from public.complaints
        where complaint_id = target_complaint_id
            and user_id = auth.uid()
        for update;

    select min(6371000 * 2 * asin(sqrt(
        power(sin(radians((drainage.latitude - complaint.latitude) / 2)), 2)
        + cos(radians(complaint.latitude)) * cos(radians(drainage.latitude))
        * power(sin(radians((drainage.longitude - complaint.longitude) / 2)), 2)
    ))) into nearest_distance
    from public.complaints complaint
    cross join public.drainage
    where complaint.complaint_id = target_complaint_id;

    select case when exists (
        select 1
        from public.complaints complaint
        cross join public.waterlogging hotspot
        where complaint.complaint_id = target_complaint_id
          and 6371000 * 2 * asin(sqrt(
              power(sin(radians((hotspot.latitude - complaint.latitude) / 2)), 2)
              + cos(radians(complaint.latitude)) * cos(radians(hotspot.latitude))
              * power(sin(radians((hotspot.longitude - complaint.longitude) / 2)), 2)
          )) <= 250
          and upper(hotspot.risk) = 'HIGH'
    ) then 'High' else 'Medium' end into nearby_water_risk;

    calculated_priority := least(100, greatest(0,
        case when upper(target_severity) = 'HIGH' then 55
             when upper(target_severity) = 'MEDIUM' then 35 else 20 end
        + case when nearby_water_risk = 'High' then 25 else 10 end
        + case when nearest_distance <= 100 then 20 when nearest_distance <= 250 then 10 else 0 end
    ));

    update public.complaints
    set defect_type = target_defect_type,
        severity = target_severity,
        priority = calculated_priority,
        water_risk = nearby_water_risk,
        drainage_nearby = nearest_distance <= 250,
        nearest_drainage_distance_m = nearest_distance,
        spatial_correlation = nearest_distance <= 250 or nearby_water_risk = 'High',
        analyzed_at = now(),
        status = 'Analyzed'
    where complaint_id = target_complaint_id
      and user_id = auth.uid()
    returning * into result_record;

    if result_record.id is null then
        raise exception 'Complaint not found or not owned by current user';
    end if;

    insert into public.status_history (complaint_id, from_status, to_status)
    values (target_complaint_id, previous_status, 'Analyzed');

    return result_record;
end;
$$;

revoke all on function public.save_complaint_analysis(text, text, text, integer, text, boolean) from public;
grant execute on function public.save_complaint_analysis(text, text, text, integer, text, boolean) to authenticated;

create or replace function public.prepare_complaint_for_review(
    target_complaint_id text
)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
    result_record public.complaints;
    nearest_distance double precision;
    nearby_water_risk text;
    calculated_priority integer;
    previous_status text;
begin
    if not public.is_role('officer') then
        raise exception 'Only officers can prepare complaints for review';
    end if;

    select status into previous_status
    from public.complaints
    where complaint_id = target_complaint_id
    for update;

    if previous_status is null then
        raise exception 'Complaint not found';
    end if;

    select min(6371000 * 2 * asin(sqrt(
        power(sin(radians((drainage.latitude - complaint.latitude) / 2)), 2)
        + cos(radians(complaint.latitude)) * cos(radians(drainage.latitude))
        * power(sin(radians((drainage.longitude - complaint.longitude) / 2)), 2)
    ))) into nearest_distance
    from public.complaints complaint
    cross join public.drainage
    where complaint.complaint_id = target_complaint_id;

    select case when exists (
        select 1 from public.complaints complaint
        cross join public.waterlogging hotspot
        where complaint.complaint_id = target_complaint_id
          and 6371000 * 2 * asin(sqrt(
              power(sin(radians((hotspot.latitude - complaint.latitude) / 2)), 2)
              + cos(radians(complaint.latitude)) * cos(radians(hotspot.latitude))
              * power(sin(radians((hotspot.longitude - complaint.longitude) / 2)), 2)
          )) <= 250
          and upper(hotspot.risk) = 'HIGH'
    ) then 'High' else 'Medium' end into nearby_water_risk;

    calculated_priority := least(100, greatest(0,
        55 + case when nearby_water_risk = 'High' then 25 else 10 end
        + case when nearest_distance <= 100 then 20 when nearest_distance <= 250 then 10 else 0 end
    ));

    update public.complaints
    set defect_type = coalesce(defect_type, 'Road defect - field verification required'),
        severity = coalesce(severity, 'High'),
        priority = coalesce(priority, calculated_priority),
        water_risk = coalesce(water_risk, nearby_water_risk),
        drainage_nearby = coalesce(drainage_nearby, nearest_distance <= 250),
        nearest_drainage_distance_m = coalesce(nearest_drainage_distance_m, nearest_distance),
        spatial_correlation = coalesce(spatial_correlation, nearest_distance <= 250 or nearby_water_risk = 'High'),
        status = 'Under Review',
        analyzed_at = coalesce(analyzed_at, now())
    where complaint_id = target_complaint_id
    returning * into result_record;

    insert into public.status_history (complaint_id, from_status, to_status)
    values (target_complaint_id, previous_status, 'Under Review');

    return result_record;
end;
$$;

revoke all on function public.prepare_complaint_for_review(text) from public;
grant execute on function public.prepare_complaint_for_review(text) to authenticated;

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
        (next_status = 'Accepted' and lower(trim(current_record.status)) in ('assigned', 'reopened') and current_record.contractor_id = auth.uid() and public.is_role('contractor'))
        or (next_status = 'In Progress' and current_record.status = 'Accepted' and current_record.contractor_id = auth.uid())
        or (next_status = 'Completed Awaiting Verification' and current_record.status = 'In Progress' and current_record.contractor_id = auth.uid() and current_record.evidence_after_url is not null)
        or (next_status = 'Reopened' and lower(trim(current_record.status)) in ('completed awaiting verification', 'repair completed', 'completed', 'awaiting verification') and public.is_role('officer'))
        or (next_status = 'Closed' and lower(trim(current_record.status)) in ('completed awaiting verification', 'repair completed', 'completed', 'awaiting verification') and public.is_role('officer'))
        or (next_status = 'Assigned' and public.is_role('officer'));

    if not allowed then
        raise exception 'Transition denied. Current status: %, requested status: %, signed-in user: %', current_record.status, next_status, auth.uid();
    end if;

    update public.work_orders
    set status = next_status
    where id = target_work_order_id
    returning * into result_record;

    if next_status = 'Completed Awaiting Verification' then
        update public.complaints
        set status = 'Completed Awaiting Verification'
        where complaint_id = current_record.complaint_id;
        insert into public.status_history (complaint_id, from_status, to_status)
        values (current_record.complaint_id, current_record.status, 'Completed Awaiting Verification');
    elsif next_status = 'Closed' then
        update public.complaints
        set status = 'Closed'
        where complaint_id = current_record.complaint_id;
        insert into public.status_history (complaint_id, from_status, to_status)
        values (current_record.complaint_id, current_record.status, 'Closed');
    elsif next_status = 'Reopened' then
        update public.complaints
        set status = 'Reopened'
        where complaint_id = current_record.complaint_id;
        insert into public.status_history (complaint_id, from_status, to_status)
        values (current_record.complaint_id, current_record.status, 'Reopened');
    end if;

    insert into public.status_history (work_order_id, from_status, to_status)
    values (target_work_order_id, current_record.status, next_status);

    return result_record;
end;
$$;

revoke all on function public.transition_work_order(uuid, text) from public;
grant execute on function public.transition_work_order(uuid, text) to authenticated;

create or replace function public.submit_work_order_completion(
    target_work_order_id uuid,
    captured_latitude double precision,
    captured_longitude double precision,
    captured_accuracy double precision,
    captured_image_path text
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    work_order_record public.work_orders;
    complaint_record public.complaints;
    distance_m double precision;
    result_record public.work_orders;
begin
    select * into work_order_record
    from public.work_orders
    where id = target_work_order_id
      and contractor_id = auth.uid()
    for update;

    if work_order_record.id is null or lower(trim(work_order_record.status)) <> 'in progress' then
        raise exception 'Work order is not assigned to the current contractor or is not in progress';
    end if;

    if captured_image_path is null or captured_image_path = '' then
        raise exception 'A camera-captured repair image is required';
    end if;

    select * into complaint_record
    from public.complaints
    where complaint_id = work_order_record.complaint_id;

    distance_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians((captured_latitude - complaint_record.latitude) / 2)), 2)
        + cos(radians(complaint_record.latitude)) * cos(radians(captured_latitude))
        * power(sin(radians((captured_longitude - complaint_record.longitude) / 2)), 2)
    ));

    if distance_m > 25 then
        raise exception 'Repair location is % meters from the complaint location; move to the pothole before submitting', round(distance_m)::text;
    end if;

    update public.work_orders
    set evidence_after_url = captured_image_path,
        repair_latitude = captured_latitude,
        repair_longitude = captured_longitude,
        repair_accuracy = captured_accuracy,
        repair_captured_at = now(),
        status = 'Completed Awaiting Verification'
    where id = target_work_order_id
    returning * into result_record;

    update public.complaints
    set status = 'Completed Awaiting Verification'
    where complaint_id = work_order_record.complaint_id;

    insert into public.status_history (work_order_id, from_status, to_status)
    values (target_work_order_id, work_order_record.status, 'Completed Awaiting Verification');
    insert into public.status_history (complaint_id, from_status, to_status)
    values (work_order_record.complaint_id, 'In Progress', 'Completed Awaiting Verification');

    return result_record;
end;
$$;

revoke all on function public.submit_work_order_completion(uuid, double precision, double precision, double precision, text) from public;
grant execute on function public.submit_work_order_completion(uuid, double precision, double precision, double precision, text) to authenticated;

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
    generated_work_order_number text;
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

    if previous_status <> 'Verified' then
        raise exception 'Complaint must be verified before work can be created';
    end if;

    generated_work_order_number := 'WO-' || right(replace(gen_random_uuid()::text, '-', ''), 8);

        insert into public.work_orders (work_order_id, work_order_number, complaint_id, status)
    values (generated_work_order_number,
            generated_work_order_number,
            target_complaint_id,
            'Assigned')
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
declare
    result_record public.work_orders;
    complaint_status text;
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

    select status into complaint_status
    from public.complaints
    where complaint_id = (select complaint_id from public.work_orders where id = target_work_order_id)
    for update;

    if complaint_status not in ('Work Order Created', 'Contractor Assigned', 'Reopened') then
        raise exception 'Complaint is not ready for contractor assignment';
    end if;

    update public.work_orders
    set contractor_id = target_contractor_id,
        status = 'Assigned'
    where id = target_work_order_id
    returning * into result_record;

    if result_record.id is null then
        raise exception 'Work order not found';
    end if;

    update public.complaints
    set status = 'Contractor Assigned'
    where complaint_id = result_record.complaint_id;

    insert into public.status_history (complaint_id, from_status, to_status)
    values (result_record.complaint_id, complaint_status, 'Contractor Assigned');

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
