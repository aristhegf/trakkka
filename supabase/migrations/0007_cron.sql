-- AssetWatch migration 0007: scheduled jobs (pg_cron)
-- Vercel Hobby cron runs once a day, so all sub-daily work is scheduled here.

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in
    ('assetwatch_no_report_sweep', 'assetwatch_retention', 'assetwatch_notify_dispatch');
exception when others then null;
end $$;

select cron.schedule('assetwatch_no_report_sweep', '* * * * *', $$select public.sweep_no_report()$$);
select cron.schedule('assetwatch_retention', '30 3 * * *', $$select public.run_retention()$$);
select cron.schedule('assetwatch_notify_dispatch', '* * * * *', $$select public.trigger_notification_dispatch()$$);

-- To enable email/push dispatch, store the dispatcher URL and secret in Vault once:
--   select vault.create_secret('https://<your-domain>/api/notify/dispatch', 'assetwatch_dispatch_url');
--   select vault.create_secret('<same value as NOTIFY_DISPATCH_SECRET env>', 'assetwatch_dispatch_secret');
