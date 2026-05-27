/*
  # Create buyer_companies and buyer_company_contacts tables

  ## Purpose
  Provides a contact book of buyer (client) companies for the invoicing module.
  Owners can maintain a list of their clients, then prefill buyer fields on new
  invoices. This is separate from the SaaS `companies` tenant table.

  ## New Tables

  ### buyer_companies
  - `id`                        — PK, UUID
  - `company_id`                — FK → companies(id) on delete cascade (the SaaS tenant)
  - `owner_id`                  — FK → users(id) on delete cascade (the user who created it)
  - `name`                      — buyer display name (required)
  - `nip`                       — Polish tax ID
  - `vat_payer`                 — whether the buyer is a VAT payer
  - `street`, `postal_code`, `city`, `country` — address
  - `email`                     — contact email
  - `phone`                     — contact phone
  - `billing_email`             — separate billing email
  - `default_payment_terms_days`— default net terms (e.g. 14)
  - `default_payment_method`    — e.g. 'transfer'
  - `notes`                     — free text notes
  - `deleted_at`                — soft delete timestamp (NULL = active)
  - `created_at`, `updated_at`  — audit timestamps

  ### buyer_company_contacts
  - `id`          — PK, UUID
  - `company_id`  — FK → buyer_companies(id) on delete cascade
  - `name`        — contact full name
  - `email`, `phone`, `role` — contact details
  - `created_at`, `updated_at`

  ## Security
  - RLS enabled on both tables
  - owner_id must equal auth.uid() (owner-scoped)
  - Soft-deleted rows are hidden by SELECT policy

  ## Indexes
  - buyer_companies(company_id)
  - buyer_companies(owner_id)
  - buyer_companies(nip) where nip IS NOT NULL
  - buyer_companies(name)
  - buyer_company_contacts(company_id)
*/

-- ─── buyer_companies ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.buyer_companies (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id                     uuid        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  name                         text        NOT NULL,
  nip                          text,
  vat_payer                    boolean     NOT NULL DEFAULT true,
  street                       text,
  postal_code                  text,
  city                         text,
  country                      text        NOT NULL DEFAULT 'Polska',
  email                        text,
  phone                        text,
  billing_email                text,
  default_payment_terms_days   int         NOT NULL DEFAULT 14,
  default_payment_method       text        NOT NULL DEFAULT 'transfer',
  notes                        text,
  deleted_at                   timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyer_companies_company_id_idx ON public.buyer_companies (company_id);
CREATE INDEX IF NOT EXISTS buyer_companies_owner_id_idx   ON public.buyer_companies (owner_id);
CREATE INDEX IF NOT EXISTS buyer_companies_name_idx       ON public.buyer_companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS buyer_companies_nip_idx        ON public.buyer_companies (nip) WHERE nip IS NOT NULL;

ALTER TABLE public.buyer_companies ENABLE ROW LEVEL SECURITY;

-- SELECT: company members can read non-deleted rows (invoicing module is multi-user)
CREATE POLICY "Company members can view buyer companies"
  ON public.buyer_companies FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND company_id = (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1
    )
  );

-- INSERT: owner only (role = 'owner' in the users table)
CREATE POLICY "Owners can insert buyer companies"
  ON public.buyer_companies FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      SELECT u.role FROM public.users u WHERE u.id = auth.uid() LIMIT 1
    ) = 'owner'
  );

-- UPDATE: owner only, must own the row
CREATE POLICY "Owners can update own buyer companies"
  ON public.buyer_companies FOR UPDATE
  TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: never physically deleted (use soft-delete via updated_at/deleted_at)
-- Handled in application layer; no hard-delete policy granted.

-- ─── buyer_company_contacts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.buyer_company_contacts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.buyer_companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  email       text,
  phone       text,
  role        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyer_company_contacts_company_id_idx ON public.buyer_company_contacts (company_id);

ALTER TABLE public.buyer_company_contacts ENABLE ROW LEVEL SECURITY;

-- SELECT: same company
CREATE POLICY "Company members can view buyer company contacts"
  ON public.buyer_company_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_companies bc
      WHERE bc.id = buyer_company_contacts.company_id
        AND bc.deleted_at IS NULL
        AND bc.company_id = (
          SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1
        )
    )
  );

-- INSERT: owner only
CREATE POLICY "Owners can insert buyer company contacts"
  ON public.buyer_company_contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.buyer_companies bc
      WHERE bc.id = buyer_company_contacts.company_id
        AND bc.owner_id = auth.uid()
    )
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid() LIMIT 1) = 'owner'
  );

-- UPDATE: owner only
CREATE POLICY "Owners can update buyer company contacts"
  ON public.buyer_company_contacts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_companies bc
      WHERE bc.id = buyer_company_contacts.company_id
        AND bc.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.buyer_companies bc
      WHERE bc.id = buyer_company_contacts.company_id
        AND bc.owner_id = auth.uid()
    )
  );

-- DELETE: owner only
CREATE POLICY "Owners can delete buyer company contacts"
  ON public.buyer_company_contacts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_companies bc
      WHERE bc.id = buyer_company_contacts.company_id
        AND bc.owner_id = auth.uid()
    )
  );
