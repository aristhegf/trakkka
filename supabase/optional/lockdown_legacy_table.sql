-- OPTIONAL, run manually if you keep the old "phone theft case tracker" table in this project.
-- Enabling RLS with no policies makes public.phone_theft_cases unreadable and unwritable with the
-- publishable (anon) key. The old index.html will stop working, which is the intent.
-- Export the data first if you still need it (Table editor -> Export CSV).

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'phone_theft_cases') then
    execute 'alter table public.phone_theft_cases enable row level security';
    execute 'revoke all on table public.phone_theft_cases from anon, authenticated';
  end if;
end $$;
