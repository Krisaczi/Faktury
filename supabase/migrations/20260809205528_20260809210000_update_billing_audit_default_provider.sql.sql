/* Update billing_audit defaults to internal provider */
ALTER TABLE public.billing_audit
  ALTER COLUMN provider SET DEFAULT 'internal';
