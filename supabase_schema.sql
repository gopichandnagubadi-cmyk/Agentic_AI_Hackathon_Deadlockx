-- ============================================================
-- SMART CITY / URBAN INFRASTRUCTURE
-- FINAL NON-DESTRUCTIVE SUPABASE SETUP
-- ============================================================
-- IMPORTANT:
-- This version does NOT drop existing application tables.
-- It is intended for your already-created SmartCity database.
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- 2. ENSURE TABLES EXIST
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    role text not null default 'citizen'
        check (role in ('citizen','officer','contractor')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


create table if not exists public.drainage_points (
    id uuid primary key default gen_random_uuid(),
    name text,
    type text default 'Storm Drain',
    latitude double precision not null,
    longitude double precision not null,
    risk_level text default 'Medium'
        check (risk_level in ('Low','Medium','High')),
    created_at timestamptz not null default now()
);


create table if not exists public.waterlogging_hotspots (
    id uuid primary key default gen_random_uuid(),
    name text,
    latitude double precision not null,
    longitude double precision not null,
    risk_level text default 'Medium'
        check (risk_level in ('Low','Medium','High')),
    historical_frequency integer default 1,
    created_at timestamptz not null default now()
);


create table if not exists public.road_segments (
    id uuid primary key default gen_random_uuid(),
    name text,
    latitude double precision,
    longitude double precision,
    importance_score integer default 50
        check (importance_score between 0 and 100),
    created_at timestamptz not null default now()
);


create table if not exists public.complaints (
    id uuid primary key default gen_random_uuid(),
    complaint_id text unique not null,
    user_id uuid references auth.users(id) on delete set null,
    image_url text,
    defect_type text,
    severity text
        check (severity in ('Normal','Medium','Very Serious')),
    estimated_size_m2 double precision,
    approximate_depth_cm double precision,
    latitude double precision not null,
    longitude double precision not null,
    accuracy double precision,
    locality text,
    city text,
    state text,
    location_name text,
    notes text,
    water_risk text default 'Low'
        check (water_risk in ('Low','Medium','High')),
    drainage_nearby boolean default false,
    nearest_drainage_distance_m double precision,
    spatial_correlation boolean default false,
    priority integer
        check (priority between 0 and 100),
    status text not null default 'Reported'
        check (
            status in (
                'Reported',
                'Reviewed',
                'Assigned',
                'In Progress',
                'Completed Awaiting Verification',
                'Reopened',
                'Closed'
            )
        ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    analyzed_at timestamptz
);


create table if not exists public.defects (
    id uuid primary key default gen_random_uuid(),
    complaint_id text unique
        references public.complaints(complaint_id)
        on delete cascade,
    defect_type text,
    severity text,
    confidence numeric(5,2),
    segmentation_note text,
    estimated_size_m2 double precision,
    approximate_depth_cm double precision,
    created_at timestamptz not null default now()
);


create table if not exists public.contractors (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid unique
        references public.profiles(id)
        on delete cascade,
    company_name text,
    specialization text,
    active boolean not null default true,
    created_at timestamptz not null default now()
);


create table if not exists public.work_orders (
    id uuid primary key default gen_random_uuid(),
    work_order_id uuid not null default gen_random_uuid(),
    work_order_number text unique not null,
    complaint_id text unique not null
        references public.complaints(complaint_id)
        on delete cascade,
    contractor_id uuid
        references public.profiles(id)
        on delete set null,
    assigned_by uuid
        references public.profiles(id)
        on delete set null,
    status text not null default 'Assigned'
        check (
            status in (
                'Assigned',
                'Accepted',
                'In Progress',
                'Completed Awaiting Verification',
                'Reopened',
                'Closed'
            )
        ),
    description text,
    evidence_before_url text,
    evidence_after_url text,
    repair_latitude double precision,
    repair_longitude double precision,
    repair_accuracy double precision,
    assigned_at timestamptz default now(),
    accepted_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    verified_at timestamptz,
    verified_by uuid
        references public.profiles(id)
        on delete set null,
    verification_note text,
    repair_evidence boolean default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


create table if not exists public.repair_evidence (
    id uuid primary key default gen_random_uuid(),
    work_order_id uuid not null
        references public.work_orders(id)
        on delete cascade,
    before_image_url text,
    after_image_url text,
    captured_by uuid
        references public.profiles(id)
        on delete set null,
    latitude double precision,
    longitude double precision,
    accuracy double precision,
    captured_at timestamptz not null default now(),
    notes text
);


create table if not exists public.duplicate_reports (
    id uuid primary key default gen_random_uuid(),
    complaint_id text
        references public.complaints(complaint_id)
        on delete cascade,
    possible_duplicate_id text
        references public.complaints(complaint_id)
        on delete cascade,
    distance_m double precision,
    similarity_reason text,
    created_at timestamptz not null default now()
);


-- Keep existing installations compatible with the current duplicate report shape.
alter table public.duplicate_reports
    add column if not exists complaint_id text;

alter table public.duplicate_reports
    add column if not exists possible_duplicate_id text;


create table if not exists public.complaint_status_history (
    id uuid primary key default gen_random_uuid(),
    complaint_id text not null
        references public.complaints(complaint_id)
        on delete cascade,
    old_status text,
    new_status text not null,
    changed_by uuid
        references public.profiles(id)
        on delete set null,
    note text,
    created_at timestamptz not null default now()
);


-- ============================================================
-- 3. ADD MISSING COLUMNS IF YOUR EXISTING TABLES DON'T HAVE THEM
-- ============================================================

alter table public.profiles
add column if not exists full_name text;

alter table public.profiles
add column if not exists role text default 'citizen';

alter table public.profiles
add column if not exists created_at timestamptz default now();

alter table public.profiles
add column if not exists updated_at timestamptz default now();


alter table public.complaints
add column if not exists locality text;

alter table public.complaints
add column if not exists city text;

alter table public.complaints
add column if not exists state text;

alter table public.complaints
add column if not exists location_name text;

alter table public.complaints
add column if not exists accuracy double precision;

alter table public.complaints
add column if not exists water_risk text default 'Low';

alter table public.complaints
add column if not exists drainage_nearby boolean default false;

alter table public.complaints
add column if not exists nearest_drainage_distance_m double precision;

alter table public.complaints
add column if not exists spatial_correlation boolean default false;

alter table public.complaints
add column if not exists priority integer;

alter table public.complaints
add column if not exists analyzed_at timestamptz;


alter table public.work_orders
add column if not exists evidence_before_url text;

alter table public.work_orders
add column if not exists evidence_after_url text;

alter table public.work_orders
add column if not exists description text;

alter table public.work_orders
add column if not exists repair_latitude double precision;

alter table public.work_orders
add column if not exists repair_longitude double precision;

alter table public.work_orders
add column if not exists repair_accuracy double precision;

alter table public.work_orders
add column if not exists accepted_at timestamptz;

alter table public.work_orders
add column if not exists started_at timestamptz;

alter table public.work_orders
add column if not exists completed_at timestamptz;

alter table public.work_orders
add column if not exists verified_at timestamptz;

alter table public.work_orders
add column if not exists verified_by uuid;

alter table public.work_orders
add column if not exists verification_note text;

alter table public.work_orders
add column if not exists repair_evidence boolean default false;

-- Compatibility fallback for older create_work_order RPC deployments.
alter table public.work_orders
    alter column work_order_number set default (
        'WO-' || upper(right(replace(gen_random_uuid()::text, '-', ''), 8))
    );

alter table public.work_orders
    add column if not exists work_order_id uuid;

update public.work_orders
set work_order_id = gen_random_uuid()
where work_order_id is null;

alter table public.work_orders
    alter column work_order_id set default gen_random_uuid();

alter table public.work_orders
    alter column work_order_id set not null;


-- ============================================================
-- 4. AUTH -> PROFILE
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

    insert into public.profiles (
        id,
        full_name,
        role
    )
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            new.email
        ),
        coalesce(
            new.raw_user_meta_data->>'role',
            'citizen'
        )
    )
    on conflict (id)
    do update set
        full_name = coalesce(
            excluded.full_name,
            public.profiles.full_name
        );

    return new;

end;
$$;


drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ============================================================
-- 5. ROLE CHECK FUNCTION
-- IMPORTANT:
-- DO NOT DROP THIS FUNCTION.
-- Existing RLS policies depend on it.
-- ============================================================

create or replace function public.is_role(required_role text)
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
          and role = required_role
    );
$$;


-- ============================================================
-- 6. COMPLAINT ANALYSIS ENGINE
-- ============================================================

drop function if exists public.analyze_complaint(text);

create or replace function public.analyze_complaint(
    target_complaint_id text,
    target_defect_type text default 'Pothole',
    target_detection_area_ratio double precision default null,
    target_detection_confidence double precision default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$

declare
    c public.complaints;
    d record;

    dist_d double precision;
    dist_w double precision;

    wr text;
    sev text;

    dup boolean := false;
    score integer;

    sz double precision;
    dep double precision;
    defect_name text;
    area_ratio double precision;
    confidence double precision;
    type_factor double precision;

begin

    select *
    into c
    from public.complaints
    where complaint_id = target_complaint_id;

    if not found then
        raise exception 'Complaint not found';
    end if;

    defect_name := coalesce(nullif(target_defect_type, ''), c.defect_type, 'Pothole');
    area_ratio := least(0.75, greatest(0.002, coalesce(target_detection_area_ratio, 0.05)));
    confidence := least(1, greatest(0, coalesce(target_detection_confidence, 0.5)));
    type_factor := case lower(defect_name)
        when 'structural defect' then 1.25
        when 'waterlogging' then 1.15
        when 'surface degradation' then 0.9
        when 'road crack' then 0.75
        when 'drainage defect' then 1.1
        else 1.0
    end;


    -- Find nearest drainage point
    select
        dp.*,
        (
            6371000 * acos(
                least(
                    1,
                    cos(radians(c.latitude))
                    * cos(radians(dp.latitude))
                    * cos(
                        radians(dp.longitude)
                        - radians(c.longitude)
                    )
                    + sin(radians(c.latitude))
                    * sin(radians(dp.latitude))
                )
            )
        ) as distance
    into d
    from public.drainage_points dp
    order by distance
    limit 1;


    dist_d := coalesce(d.distance, 999999);


    if dist_d <= 100 then

        c.drainage_nearby := true;
        c.nearest_drainage_distance_m := dist_d;

    else

        c.drainage_nearby := false;
        c.nearest_drainage_distance_m := dist_d;

    end if;


    -- Find nearest waterlogging hotspot
    select
        (
            6371000 * acos(
                least(
                    1,
                    cos(radians(c.latitude))
                    * cos(radians(wh.latitude))
                    * cos(
                        radians(wh.longitude)
                        - radians(c.longitude)
                    )
                    + sin(radians(c.latitude))
                    * sin(radians(wh.latitude))
                )
            )
        ),
        wh.risk_level

    into dist_w, wr

    from public.waterlogging_hotspots wh

    order by 1

    limit 1;


    if coalesce(wr,'Low') = 'High'
       and coalesce(dist_w,999999) <= 500 then

        c.spatial_correlation := true;
        c.water_risk := 'High';

    elsif coalesce(wr,'Low') = 'Medium'
       and coalesce(dist_w,999999) <= 500 then

        c.spatial_correlation := true;
        c.water_risk := 'Medium';

    else

        c.spatial_correlation := false;
        c.water_risk := 'Low';

    end if;


    -- Approximate physical values derived from detected image area and type.
    sz :=
        round(((0.25 + (area_ratio * 18) + (confidence * 0.35)) * type_factor)::numeric, 2)::double precision;


    dep :=
        round(((3 + (area_ratio * 38) + (confidence * 3)) * type_factor)::numeric, 1)::double precision;

    if lower(coalesce(c.notes,'')) ~ '(deep|dangerous)' then
        dep := dep + 3;
    end if;


    -- Severity bands compare estimated size and depth for each defect family.
    if lower(defect_name) in ('structural defect', 'drainage defect') then
        sev := 'Very Serious';

    elsif lower(defect_name) in ('surface degradation', 'waterlogging') then
        if c.water_risk = 'High' or sz >= 4.0 or dep >= 15 then
            sev := 'Very Serious';
        else
            sev := 'Medium';
        end if;

    elsif c.water_risk = 'High'
       or sz >= (case lower(defect_name)
           when 'road crack' then 3.0
           else 3.5
       end)
       or dep >= 15 then
        sev := 'Very Serious';

    elsif c.water_risk = 'Medium'
       or sz >= (case lower(defect_name)
           when 'road crack' then 1.2
           else 1.5
       end)
       or dep >= (case lower(defect_name)
           when 'road crack' then 6
           else 8
       end) then
        sev := 'Medium';

    else
        sev := 'Normal';
    end if;


    -- Duplicate detection
    select exists (

        select 1

        from public.complaints x

        where x.complaint_id <> c.complaint_id

        and sqrt(
            power(
                (x.latitude - c.latitude) * 111000,
                2
            )
            +
            power(
                (x.longitude - c.longitude)
                * 111000
                * cos(radians(c.latitude)),
                2
            )
        ) < 75

        and x.status <> 'Closed'

    )
    into dup;


    -- Maintenance priority score
    score :=
        least(
            100,
            greatest(
                0,

                (
                    case sev
                        when 'Very Serious' then 65
                        when 'Medium' then 40
                        else 20
                    end
                )

                +

                (
                    case c.water_risk
                        when 'High' then 20
                        when 'Medium' then 10
                        else 0
                    end
                )

                +

                (
                    case
                        when c.drainage_nearby then 8
                        else 0
                    end
                )

                +

                (
                    case
                        when dup then 5
                        else 0
                    end
                )

            )
        );


    update public.complaints

    set
        defect_type = defect_name,

        severity = sev,

        estimated_size_m2 = sz,

        approximate_depth_cm = dep,

        water_risk = c.water_risk,

        drainage_nearby = c.drainage_nearby,

        nearest_drainage_distance_m =
            c.nearest_drainage_distance_m,

        spatial_correlation =
            c.spatial_correlation,

        priority = score,

        analyzed_at = now(),

        updated_at = now()

    where complaint_id = c.complaint_id;


    insert into public.defects (
        complaint_id,
        defect_type,
        severity,
        confidence,
        segmentation_note,
        estimated_size_m2,
        approximate_depth_cm
    )

    values (
        c.complaint_id,
        defect_name,
        sev,
        94,
        'Prototype segmentation estimate',
        sz,
        dep
    )

    on conflict (complaint_id)

    do update set

        defect_type =
            excluded.defect_type,

        severity =
            excluded.severity,

        confidence =
            excluded.confidence,

        estimated_size_m2 =
            excluded.estimated_size_m2,

        approximate_depth_cm =
            excluded.approximate_depth_cm;


    return json_build_object(

        'complaint_id',
        c.complaint_id,

        'defect_type',
        defect_name,

        'severity',
        sev,

        'estimated_size_m2',
        sz,

        'approximate_depth_cm',
        dep,

        'severity_ranges',
        case lower(defect_name)
            when 'pothole' then 'Normal: size < 1.5 m2 and depth < 8 cm; Medium: size 1.5-3.5 m2 or depth 8-15 cm; Very Serious: size >= 3.5 m2 or depth >= 15 cm'
            when 'road crack' then 'Normal: size < 1.2 m2 and depth < 6 cm; Medium: size 1.2-3.0 m2 or depth 6-15 cm; Very Serious: size >= 3.0 m2 or depth >= 15 cm'
            when 'surface degradation' then 'Medium by type; Very Serious: size >= 4.0 m2 or depth >= 15 cm'
            when 'waterlogging' then 'Medium by type; Very Serious: size >= 4.0 m2 or depth >= 15 cm or high water risk'
            else 'Very Serious by defect type'
        end,

        'water_risk',
        c.water_risk,

        'drainage_nearby',
        c.drainage_nearby,

        'nearest_drainage_distance_m',
        c.nearest_drainage_distance_m,

        'duplicate_found',
        dup,

        'priority',
        score

    );

end;
$$;


-- ============================================================
-- 7. CREATE WORK ORDER
-- OFFICER -> CONTRACTOR
-- ============================================================

create or replace function public.create_work_order(
    target_complaint_id text,
    target_contractor_id uuid
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$

declare
    c public.complaints;
    w public.work_orders;

begin

    if auth.uid() is null then
        raise exception 'Your officer session has expired. Log in again.';
    end if;

    if target_complaint_id is null or btrim(target_complaint_id) = '' then
        raise exception 'A complaint is required to create a work order.';
    end if;

    if target_contractor_id is null then
        raise exception 'A contractor is required to create a work order.';
    end if;

    if not public.is_role('officer') then
        raise exception
            'Only municipal officers can assign work';
    end if;


    select *
    into c
    from public.complaints
    where complaint_id = target_complaint_id;


    if not found then
        raise exception 'Complaint not found';
    end if;


    if not exists (
        select 1
        from public.profiles
        where id = target_contractor_id
          and role = 'contractor'
    ) then

        raise exception 'Invalid contractor';

    end if;

    select *
    into w
    from public.work_orders
    where complaint_id = c.complaint_id;

    if found then
        update public.work_orders
        set
            contractor_id = target_contractor_id,
            assigned_by = auth.uid(),
            status = 'Assigned',
            evidence_after_url = null,
            repair_latitude = null,
            repair_longitude = null,
            repair_accuracy = null,
            repair_evidence = false,
            assigned_at = now(),
            accepted_at = null,
            started_at = null,
            completed_at = null,
            verified_at = null,
            verified_by = null,
            updated_at = now()
        where id = w.id
        returning * into w;

        update public.complaints
        set status = 'Assigned', updated_at = now()
        where complaint_id = c.complaint_id;

        return w;
    end if;


    insert into public.work_orders (
        work_order_id,
        work_order_number,
        complaint_id,
        contractor_id,
        assigned_by,
        status,
        description,
        evidence_before_url
    )

    values (
        gen_random_uuid(),
        'WO-' ||
        upper(
            right(
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                ),
                8
            )
        ),

        c.complaint_id,

        target_contractor_id,

        auth.uid(),

        'Assigned',

        'Repair reported urban infrastructure defect',

        c.image_url
    )

    returning *
    into w;


    update public.complaints

    set
        status = 'Assigned',
        updated_at = now()

    where complaint_id = c.complaint_id;


    insert into public.complaint_status_history (
        complaint_id,
        old_status,
        new_status,
        changed_by
    )

    values (
        c.complaint_id,
        c.status,
        'Assigned',
        auth.uid()
    );


    return w;

end;
$$;


-- ============================================================
-- 8. CONTRACTOR SUBMITS REPAIR EVIDENCE
-- ============================================================

drop function if exists public.submit_repair_evidence(uuid, text);

create or replace function public.submit_repair_evidence(
    target_work_order_id uuid,
    target_after_url text,
    target_latitude double precision,
    target_longitude double precision,
    target_accuracy double precision
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$

declare
    w public.work_orders;

begin

    if target_latitude is null or target_longitude is null then
        raise exception 'Contractor GPS location is required';
    end if;

    select *
    into w
    from public.work_orders
    where id = target_work_order_id
      and contractor_id = auth.uid();


    if not found then
        raise exception
            'Work order not assigned to this contractor';
    end if;


    if w.status not in (
        'In Progress',
        'Accepted',
        'Reopened'
    ) then

        raise exception
            'Work order is not ready for completion';

    end if;

    if 6371000 * 2 * asin(
        sqrt(
            sin(radians(target_latitude - (
                select latitude from public.complaints
                where complaint_id = w.complaint_id
            )) / 2) ^ 2
            + cos(radians(target_latitude)) *
              cos(radians((select latitude from public.complaints where complaint_id = w.complaint_id))) *
              sin(radians(target_longitude - (
                  select longitude from public.complaints
                  where complaint_id = w.complaint_id
              )) / 2) ^ 2
        )
    ) > 20 then
        raise exception 'Contractor is too far from the pothole location (must be within 20 meters)';
    end if;


    update public.work_orders

    set
        evidence_after_url = target_after_url,

        status =
            'Completed Awaiting Verification',

        completed_at = now(),

        repair_evidence = true,

        repair_latitude = target_latitude,
        repair_longitude = target_longitude,
        repair_accuracy = target_accuracy,

        updated_at = now()

    where id = w.id

    returning *
    into w;


    update public.complaints

    set
        status =
            'Completed Awaiting Verification',

        updated_at = now()

    where complaint_id = w.complaint_id;


    insert into public.repair_evidence (
        work_order_id,
        before_image_url,
        after_image_url,
        captured_by,
        latitude,
        longitude,
        accuracy
    )

    values (
        w.id,
        w.evidence_before_url,
        target_after_url,
        auth.uid(),
        target_latitude,
        target_longitude,
        target_accuracy
    );


    return w;

end;
$$;


-- ============================================================
-- 9. WORK ORDER LIFECYCLE
-- ============================================================

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
    w public.work_orders;
    old_status text;

begin

    select *
    into w
    from public.work_orders
    where id = target_work_order_id;


    if not found then
        raise exception 'Work order not found';
    end if;


    old_status := w.status;


    -- Contractor accepts assignment
    if next_status = 'Accepted'
       and w.contractor_id = auth.uid()
       and old_status = 'Assigned' then


        update public.work_orders

        set
            status = 'Accepted',
            accepted_at = now(),
            updated_at = now()

        where id = w.id

        returning *
        into w;


        -- Contractor starts work
        elsif next_status = 'In Progress'
            and w.contractor_id = auth.uid()
            and old_status = 'Accepted' then


        update public.work_orders

        set
            status = 'In Progress',
            started_at = now(),
            updated_at = now()

        where id = w.id

        returning *
        into w;


    -- Officer approves completed work
    elsif next_status = 'Closed'
          and public.is_role('officer')
          and old_status =
              'Completed Awaiting Verification'
          and w.evidence_after_url is not null then


        update public.work_orders

        set
            status = 'Closed',
            verified_at = now(),
            verified_by = auth.uid(),
            updated_at = now()

        where id = w.id

        returning *
        into w;


        update public.complaints

        set
            status = 'Closed',
            updated_at = now()

        where complaint_id = w.complaint_id;


    -- Officer rejects completed work
    elsif next_status = 'Reopened'
          and public.is_role('officer')
          and old_status =
              'Completed Awaiting Verification' then


        update public.work_orders

        set
            status = 'Assigned',
            verification_note =
                'Officer requested rework',
            evidence_after_url = null,
            repair_latitude = null,
            repair_longitude = null,
            repair_accuracy = null,
            repair_evidence = false,
            accepted_at = null,
            started_at = null,
            completed_at = null,
            verified_at = null,
            verified_by = null,
            updated_at = now()

        where id = w.id

        returning *
        into w;


        update public.complaints

        set
            status = 'Assigned',
            updated_at = now()

        where complaint_id = w.complaint_id;


    else

        raise exception
            'Invalid lifecycle transition';

    end if;


    insert into public.complaint_status_history (
        complaint_id,
        old_status,
        new_status,
        changed_by
    )

    values (
        w.complaint_id,
        old_status,
        w.status,
        auth.uid()
    );


    return w;

end;
$$;


-- ============================================================
-- 10. ENABLE RLS
-- ============================================================

alter table public.profiles enable row level security;

alter table public.complaints enable row level security;

alter table public.defects enable row level security;

alter table public.drainage_points enable row level security;

alter table public.waterlogging_hotspots enable row level security;

alter table public.road_segments enable row level security;

alter table public.contractors enable row level security;

alter table public.work_orders enable row level security;

alter table public.repair_evidence enable row level security;

alter table public.duplicate_reports enable row level security;

alter table public.complaint_status_history enable row level security;


-- ============================================================
-- 11. REMOVE ONLY OLD POLICIES
-- DO NOT DROP TABLES
-- DO NOT DROP is_role()
-- ============================================================

drop policy if exists profiles_select_authenticated
on public.profiles;

drop policy if exists profiles_insert_own
on public.profiles;

drop policy if exists profiles_update_own
on public.profiles;


drop policy if exists complaints_insert_citizen
on public.complaints;

drop policy if exists complaints_select_owner_officer_contractor
on public.complaints;

drop policy if exists complaints_select_owner_or_officer
on public.complaints;

drop policy if exists complaints_update_officer
on public.complaints;


drop policy if exists defects_select_authenticated
on public.defects;

drop policy if exists infra_select_authenticated
on public.drainage_points;

drop policy if exists drainage_select_authenticated
on public.drainage_points;

drop policy if exists water_select_authenticated
on public.waterlogging_hotspots;

drop policy if exists waterlogging_select_authenticated
on public.waterlogging_hotspots;

drop policy if exists road_select_authenticated
on public.road_segments;

drop policy if exists roads_select_authenticated
on public.road_segments;

drop policy if exists contractor_profiles_select
on public.contractors;

drop policy if exists contractors_select_authenticated
on public.contractors;


drop policy if exists work_orders_select_participants
on public.work_orders;

drop policy if exists work_select_participants
on public.work_orders;

drop policy if exists repair_evidence_select_participants
on public.repair_evidence;

drop policy if exists repair_select_participants
on public.repair_evidence;

drop policy if exists duplicate_reports_select_participants
on public.duplicate_reports;

drop policy if exists duplicate_select_participants
on public.duplicate_reports;

drop policy if exists complaint_history_select_participants
on public.complaint_status_history;

drop policy if exists history_select_participants
on public.complaint_status_history;


-- ============================================================
-- 12. PROFILES POLICIES
-- ============================================================

create policy profiles_select_authenticated

on public.profiles

for select

to authenticated

using (true);


create policy profiles_insert_own

on public.profiles

for insert

to authenticated

with check (
    id = auth.uid()
);


create policy profiles_update_own

on public.profiles

for update

to authenticated

using (
    id = auth.uid()
)

with check (
    id = auth.uid()
);


-- ============================================================
-- 13. COMPLAINT POLICIES
-- ============================================================

create policy complaints_insert_citizen

on public.complaints

for insert

to authenticated

with check (
    user_id = auth.uid()
    and public.is_role('citizen')
);


create policy complaints_select_owner_officer_contractor

on public.complaints

for select

to authenticated

using (

    user_id = auth.uid()

    or public.is_role('officer')

    or exists (

        select 1

        from public.work_orders w

        where w.complaint_id =
              complaints.complaint_id

        and w.contractor_id =
            auth.uid()

    )

);


create policy complaints_update_officer

on public.complaints

for update

to authenticated

using (
    public.is_role('officer')
)

with check (
    public.is_role('officer')
);


-- ============================================================
-- 14. DEFECTS
-- ============================================================

create policy defects_select_authenticated

on public.defects

for select

to authenticated

using (true);


-- ============================================================
-- 15. GIS DATA
-- ============================================================

create policy drainage_select_authenticated

on public.drainage_points

for select

to authenticated

using (true);


create policy waterlogging_select_authenticated

on public.waterlogging_hotspots

for select

to authenticated

using (true);


create policy roads_select_authenticated

on public.road_segments

for select

to authenticated

using (true);


-- ============================================================
-- 16. CONTRACTORS
-- ============================================================

create policy contractors_select_authenticated

on public.contractors

for select

to authenticated

using (true);


-- ============================================================
-- 17. WORK ORDERS
-- ============================================================

create policy work_orders_select_participants

on public.work_orders

for select

to authenticated

using (

    public.is_role('officer')

    or contractor_id = auth.uid()

);


-- ============================================================
-- 18. REPAIR EVIDENCE
-- ============================================================

create policy repair_evidence_select_participants

on public.repair_evidence

for select

to authenticated

using (

    public.is_role('officer')

    or captured_by = auth.uid()

    or exists (

        select 1

        from public.work_orders w

        where w.id =
              repair_evidence.work_order_id

        and w.contractor_id =
            auth.uid()

    )

);


-- ============================================================
-- 19. DUPLICATE REPORTS
-- ============================================================

create policy duplicate_reports_select_participants

on public.duplicate_reports

for select

to authenticated

using (

    public.is_role('officer')

    or exists (

        select 1

        from public.complaints c

        where c.complaint_id =
              duplicate_reports.complaint_id

        and c.user_id =
            auth.uid()

    )

);


-- ============================================================
-- 20. STATUS HISTORY
-- ============================================================

create policy complaint_history_select_participants

on public.complaint_status_history

for select

to authenticated

using (

    public.is_role('officer')

    or exists (

        select 1

        from public.complaints c

        where c.complaint_id =
              complaint_status_history.complaint_id

        and c.user_id =
            auth.uid()

    )

    or exists (

        select 1

        from public.work_orders w

        where w.complaint_id =
              complaint_status_history.complaint_id

        and w.contractor_id =
            auth.uid()

    )

);


-- ============================================================
-- 21. FUNCTION PERMISSIONS
-- ============================================================

grant execute
on function public.analyze_complaint(text,text,double precision,double precision)
to authenticated;


grant execute
on function public.create_work_order(text,uuid)
to authenticated;


grant execute
on function public.submit_repair_evidence(uuid,text,double precision,double precision,double precision)
to authenticated;


grant execute
on function public.transition_work_order(uuid,text)
to authenticated;


-- ============================================================
-- 22. GIS SAMPLE DATA
-- ============================================================

insert into public.drainage_points (
    name,
    latitude,
    longitude,
    risk_level
)

values

(
    'Main Storm Drain',
    16.12380,
    80.12390,
    'High'
),

(
    'Ward Drain 08',
    16.12510,
    80.12620,
    'Medium'
)

on conflict do nothing;


insert into public.waterlogging_hotspots (
    name,
    latitude,
    longitude,
    risk_level,
    historical_frequency
)

values

(
    'Waterlogging Hotspot A',
    16.12420,
    80.12410,
    'High',
    12
),

(
    'Waterlogging Hotspot B',
    16.12600,
    80.12700,
    'Medium',
    6
)

on conflict do nothing;


-- ============================================================
-- 23. STORAGE BUCKETS
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public
)

values (
    'road-evidence',
    'road-evidence',
    false
)

on conflict (id)
do update set
    public = false;


insert into storage.buckets (
    id,
    name,
    public
)

values (
    'repair-evidence',
    'repair-evidence',
    false
)

on conflict (id)
do update set
    public = false;


-- ============================================================
-- 24. STORAGE POLICIES
-- ============================================================

drop policy if exists road_evidence_upload
on storage.objects;

drop policy if exists road_evidence_read
on storage.objects;

drop policy if exists repair_evidence_upload
on storage.objects;

drop policy if exists repair_evidence_read
on storage.objects;


create policy road_evidence_upload

on storage.objects

for insert

to authenticated

with check (

    bucket_id = 'road-evidence'

    and (storage.foldername(name))[1]
        = 'complaints'

    and (storage.foldername(name))[2]
        = auth.uid()::text

);


create policy road_evidence_read

on storage.objects

for select

to authenticated

using (

    bucket_id = 'road-evidence'

);


create policy repair_evidence_upload

on storage.objects

for insert

to authenticated

with check (

    bucket_id = 'repair-evidence'

    and (storage.foldername(name))[1]
        = 'repairs'

    and (storage.foldername(name))[2]
        = auth.uid()::text

);


create policy repair_evidence_read

on storage.objects

for select

to authenticated

using (

    bucket_id = 'repair-evidence'

);


-- ============================================================
-- 25. INDEXES
-- ============================================================

create index if not exists complaints_status_idx
on public.complaints(status);


create index if not exists complaints_severity_idx
on public.complaints(severity);


create index if not exists complaints_priority_idx
on public.complaints(priority desc);


create index if not exists complaints_location_idx
on public.complaints(latitude, longitude);


create index if not exists work_orders_contractor_idx
on public.work_orders(contractor_id, status);


create index if not exists complaints_user_idx
on public.complaints(user_id);


create index if not exists complaints_city_idx
on public.complaints(city);


create index if not exists complaints_state_idx
on public.complaints(state);


-- ============================================================
-- 26. VERIFICATION QUERIES
-- ============================================================

select
    routine_name,
    routine_type
from information_schema.routines
where routine_schema = 'public'
and routine_name in (
    'is_role',
    'handle_new_user',
    'analyze_complaint',
    'create_work_order',
    'submit_repair_evidence',
    'transition_work_order'
)
order by routine_name;


select
    tablename,
    rowsecurity
from pg_tables
where schemaname = 'public'
and tablename in (
    'profiles',
    'complaints',
    'defects',
    'drainage_points',
    'waterlogging_hotspots',
    'road_segments',
    'contractors',
    'work_orders',
    'repair_evidence',
    'duplicate_reports',
    'complaint_status_history'
)
order by tablename;


select
    tablename,
    policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


select
    id,
    name,
    public
from storage.buckets
where id in (
    'road-evidence',
    'repair-evidence'
);