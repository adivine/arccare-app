create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text, last_name text, age int, date_of_birth date, phone text,
  emergency_contact_name text, emergency_contact_phone text,
  provider_name text, provider_email text, provider_phone text,
  pharmacy_name text, pharmacy_phone text, preferred_reminder_time time,
  caregiver_access_preference text,
  created_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.oxygen_readings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  oxygen_level numeric, pulse_rate numeric, photo_url text, captured_from_photo boolean default true,
  extraction_confidence numeric, recorded_at timestamptz, notes text, source text, created_at timestamptz not null default now()
);

create table if not exists public.blood_pressure_readings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  systolic numeric, diastolic numeric, pulse_rate numeric, photo_url text, captured_from_photo boolean default true,
  extraction_confidence numeric, recorded_at timestamptz, notes text, source text, created_at timestamptz not null default now()
);

create table if not exists public.watch_summary_uploads (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source_app text, photo_url text, summary_date date, summary_date_range_start date, summary_date_range_end date,
  resting_heart_rate numeric, average_heart_rate numeric, heart_rate_range text, steps numeric,
  sleep_duration text, sleep_score numeric, weight numeric, spo2 numeric, breathing_rate numeric,
  extracted_text text, extraction_confidence numeric, notes text, source text, created_at timestamptz not null default now()
);

create table if not exists public.uploaded_reading_photos (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  reading_type text, related_reading_id uuid, photo_url text, uploaded_at timestamptz not null default now()
);

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  weight numeric, recorded_at timestamptz, notes text, source text, created_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  medication_name text, dosage text, frequency text, time_of_day text, taken_with_food boolean,
  reason text, prescribing_doctor text, pharmacy_name text, pharmacy_phone text,
  refill_date date, pills_remaining numeric, photo_url text, notes text, created_at timestamptz not null default now()
);

create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete cascade, status text, taken_at timestamptz,
  missed_reason text, notes text, created_at timestamptz not null default now()
);

create table if not exists public.refill_reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete cascade, refill_date date, days_remaining int,
  reminder_status text, marked_refilled_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider_name text, appointment_type text, appointment_date date, appointment_time time, location text,
  provider_phone text, provider_email text, questions text, notes text, follow_up_needed boolean default false,
  completed boolean default false, created_at timestamptz not null default now()
);

create table if not exists public.provider_questions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  question text, appointment_id uuid references public.appointments(id) on delete set null,
  answered boolean default false, answer_notes text, created_at timestamptz not null default now()
);

create table if not exists public.caregivers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  caregiver_email text, caregiver_name text, permission_level text, invited_at timestamptz,
  accepted_at timestamptz, active boolean default true, created_at timestamptz not null default now()
);

create table if not exists public.provider_reports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  date_range_start date, date_range_end date, report_url text, emailed_to text, created_at timestamptz not null default now()
);

create table if not exists public.uploaded_medication_photos (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete cascade, photo_url text, uploaded_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text, title text, message text, reminder_date date, reminder_time time,
  related_record_id uuid, completed boolean default false, created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
alter table public.users enable row level security;
alter table public.oxygen_readings enable row level security;
alter table public.blood_pressure_readings enable row level security;
alter table public.watch_summary_uploads enable row level security;
alter table public.uploaded_reading_photos enable row level security;
alter table public.weight_logs enable row level security;
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;
alter table public.refill_reminders enable row level security;
alter table public.appointments enable row level security;
alter table public.provider_questions enable row level security;
alter table public.caregivers enable row level security;
alter table public.provider_reports enable row level security;
alter table public.uploaded_medication_photos enable row level security;
alter table public.reminders enable row level security;

create or replace function public.can_caregiver_access(owner_id uuid, needs_edit boolean default false)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.caregivers c
    where c.user_id = owner_id and c.active = true and lower(c.caregiver_email) = lower(auth.jwt() ->> 'email')
    and (needs_edit = false or c.permission_level in ('View and edit', 'Full support access'))
  );
$$;

drop policy if exists users_own_select on public.users;
drop policy if exists users_own_update on public.users;
create policy users_own_select on public.users for select using (auth.uid() = id);
create policy users_own_update on public.users for update using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['user_profiles','oxygen_readings','blood_pressure_readings','watch_summary_uploads','uploaded_reading_photos','weight_logs','medications','medication_logs','refill_reminders','appointments','provider_questions','caregivers','provider_reports','uploaded_medication_photos','reminders']
  loop
    execute format('drop policy if exists own_select on public.%I', t);
    execute format('drop policy if exists own_insert on public.%I', t);
    execute format('drop policy if exists own_update on public.%I', t);
    execute format('drop policy if exists own_delete on public.%I', t);
    execute format('create policy own_select on public.%I for select using (auth.uid() = user_id or public.can_caregiver_access(user_id, false))', t);
    execute format('create policy own_insert on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy own_update on public.%I for update using (auth.uid() = user_id or public.can_caregiver_access(user_id, true)) with check (auth.uid() = user_id or public.can_caregiver_access(user_id, true))', t);
    execute format('create policy own_delete on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values
  ('medication-photos', 'medication-photos', false),
  ('oxygen-photos', 'oxygen-photos', false),
  ('blood-pressure-photos', 'blood-pressure-photos', false),
  ('watch-summary-photos', 'watch-summary-photos', false),
  ('report-files', 'report-files', false)
on conflict (id) do nothing;

drop policy if exists storage_owner_select on storage.objects;
drop policy if exists storage_owner_insert on storage.objects;
drop policy if exists storage_owner_update on storage.objects;
drop policy if exists storage_owner_delete on storage.objects;

create policy storage_owner_select on storage.objects for select
using (bucket_id in ('medication-photos','oxygen-photos','blood-pressure-photos','watch-summary-photos','report-files') and auth.uid()::text = (storage.foldername(name))[1]);
create policy storage_owner_insert on storage.objects for insert
with check (bucket_id in ('medication-photos','oxygen-photos','blood-pressure-photos','watch-summary-photos','report-files') and auth.uid()::text = (storage.foldername(name))[1]);
create policy storage_owner_update on storage.objects for update
using (bucket_id in ('medication-photos','oxygen-photos','blood-pressure-photos','watch-summary-photos','report-files') and auth.uid()::text = (storage.foldername(name))[1]);
create policy storage_owner_delete on storage.objects for delete
using (bucket_id in ('medication-photos','oxygen-photos','blood-pressure-photos','watch-summary-photos','report-files') and auth.uid()::text = (storage.foldername(name))[1]);
