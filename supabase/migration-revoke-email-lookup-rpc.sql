-- Restrict email lookup RPCs to service_role only.
-- Clients must use POST /api/users/lookup-email (rate-limited + timing-padded).
-- Run after migration-security-hardening.sql

revoke all on function public.find_user_by_email_safe(text) from public;
revoke all on function public.find_user_by_email_safe(text) from authenticated;
grant execute on function public.find_user_by_email_safe(text) to service_role;

revoke all on function public.find_user_by_email(text) from public;
revoke all on function public.find_user_by_email(text) from authenticated;
grant execute on function public.find_user_by_email(text) to service_role;
