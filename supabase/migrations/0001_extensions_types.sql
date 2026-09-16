-- AssetWatch migration 0001: extensions and enum types
-- Safe to run on an existing Supabase project; nothing here touches pre-existing tables.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$ begin
  create type public.asset_type as enum ('device','pet','vehicle','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.asset_status as enum ('active','archived','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.connection_status as enum ('online','offline','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_state as enum ('moving','stationary','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.geofence_kind as enum ('circle','polygon');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.geofence_event_type as enum ('enter','exit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.alert_type as enum (
    'geofence_enter','geofence_exit','battery_low','battery_critical','tracker_offline',
    'no_report','speed_limit','unexpected_movement','location_unavailable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.alert_severity as enum ('info','warning','critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('in_app','email','push','sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_status as enum ('queued','sent','failed','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ingest_status as enum ('accepted','duplicate','out_of_order','rejected','error','sampled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.share_scope as enum ('live','history');
exception when duplicate_object then null; end $$;

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
