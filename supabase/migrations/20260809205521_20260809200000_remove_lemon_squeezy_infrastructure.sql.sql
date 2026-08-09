/*
 * Remove Lemon Squeezy infrastructure.
 *
 * Drops:
 *   - billing_metadata table (stored LS subscription/customer/product IDs)
 *   - webhook_events table (LS webhook idempotency)
 *   - webhook_audit table (LS webhook trace log)
 *
 * Preserves:
 *   - billing_audit table (now used by internal upgrade flow, provider='internal')
 *   - company_package_audit table
 *   - companies.package_changed_at
 *
 * The billing_audit table is kept because the internal upgrade flow writes to
 * it with provider='internal'. The LS-specific columns in billing_metadata
 * (ls_subscription_id, ls_customer_id, etc.) are removed by dropping the table.
 */

DROP TABLE IF EXISTS public.billing_metadata CASCADE;
DROP TABLE IF EXISTS public.webhook_events CASCADE;
DROP TABLE IF EXISTS public.webhook_audit CASCADE;
