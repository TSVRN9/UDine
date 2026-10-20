-- 20261020120000_schedule_send_dish_alerts.sql: pins the two send-dish-alerts cron jobs (11:00 and
-- 12:00 UTC; the function itself gates to 7-9 AM Eastern, so both DST offsets are covered), the
-- target function, and the secret header. Same convention as 25_populate_always_available_dishes_cron.sql.
create extension if not exists pgtap;

begin;
select plan(7);

select is(
  (select schedule from cron.job where jobname = 'send-dish-alerts-1100-utc'),
  '0 11 * * *',
  'send-dish-alerts-1100-utc runs daily at 11:00 UTC'
);

select is(
  (select schedule from cron.job where jobname = 'send-dish-alerts-1200-utc'),
  '0 12 * * *',
  'send-dish-alerts-1200-utc runs daily at 12:00 UTC'
);

select matches(
  (select command from cron.job where jobname = 'send-dish-alerts-1100-utc'),
  '/functions/v1/send-dish-alerts''',
  '11:00 job targets send-dish-alerts'
);

select matches(
  (select command from cron.job where jobname = 'send-dish-alerts-1200-utc'),
  '/functions/v1/send-dish-alerts''',
  '12:00 job targets send-dish-alerts'
);

select matches(
  (select command from cron.job where jobname = 'send-dish-alerts-1100-utc'),
  '''x-udine-cron-secret'', \(\s*select decrypted_secret from vault.decrypted_secrets\s+where name = ''edge_cron_secret''',
  '11:00 job reads x-udine-cron-secret from Vault edge_cron_secret'
);

select matches(
  (select command from cron.job where jobname = 'send-dish-alerts-1200-utc'),
  '''x-udine-cron-secret'', \(\s*select decrypted_secret from vault.decrypted_secrets\s+where name = ''edge_cron_secret''',
  '12:00 job reads x-udine-cron-secret from Vault edge_cron_secret'
);

select is(
  (select count(*)::int from cron.job where jobname like 'send-dish-alerts-%'),
  2,
  'exactly two send-dish-alerts jobs'
);

select * from finish();
rollback;
