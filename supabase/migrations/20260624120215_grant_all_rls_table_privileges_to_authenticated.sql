-- Grant table-level privileges for all RLS-protected tables.
-- Without GRANT, PostgreSQL returns "permission denied" before evaluating
-- any RLS policy. Grants are scoped to match the operations each table needs.

-- Full CRUD for authenticated users (RLS policies restrict actual rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users                   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_sessions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parse_jobs              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reviews         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_flags              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_reports            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ksef_credentials        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issued_invoices         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issued_invoice_items    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_number_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_companies         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_company_contacts  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_switch_sessions    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_sessions           TO authenticated;

-- Read-heavy / append-only tables
GRANT SELECT, INSERT ON public.audit_logs                TO authenticated;
GRANT SELECT, INSERT ON public.owner_audit_logs          TO authenticated;
GRANT SELECT, INSERT ON public.role_change_logs          TO authenticated;
GRANT SELECT, INSERT ON public.role_switch_logs          TO authenticated;
GRANT SELECT, INSERT ON public.company_package_audit     TO authenticated;
GRANT SELECT, INSERT ON public.company_report_usage      TO authenticated;
GRANT SELECT, INSERT ON public.exports_audit             TO authenticated;
GRANT SELECT, INSERT ON public.user_status_changes       TO authenticated;
GRANT SELECT, INSERT ON public.trial_notifications       TO authenticated;
GRANT SELECT, INSERT ON public.email_reports             TO authenticated;

-- Public read (contact form submissions — inserts come from anon/authenticated)
GRANT INSERT ON public.contact_submissions               TO authenticated;
GRANT INSERT ON public.contact_submissions               TO anon;

-- Profiles (readable by authenticated)
GRANT SELECT, INSERT, UPDATE ON public.profiles          TO authenticated;

-- Pricing tiers (read-only for clients)
GRANT SELECT ON public.pricing_tiers                     TO authenticated;
GRANT SELECT ON public.pricing_tiers                     TO anon;
