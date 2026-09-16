-- Trakkka migration 0010: product renamed from the working name "AssetWatch" to Trakkka.
-- Provider names are shown in the UI (asset forms, detail panel), so update the one that carried the old name.
-- Internal identifiers (Vault secret names, pg_cron job names) keep their assetwatch_* names on purpose.

update public.tracking_providers set name = 'Trakkka iOS app' where key = 'ios_companion';
