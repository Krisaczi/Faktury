/*
# Default vendor company and backfill missing company links

1. Changes
   - vendors.company_id now defaults to the signed-in user's company (get_user_company_id()).
   - Vendors created with no company link (such as ones added from the browser) are linked to the company of the user who created them.

2. Why
   - Vendor profile pages only load vendors that belong to the user's company. Vendors saved without a company link were created but could not be opened, returning "not found".

3. Security
   - No policy or grant changes. Existing row-level security on vendors still applies.

4. Notes
   - The backfill only touches rows where company_id is empty and the creating user belongs to a company.
   - Safe to re-run: the default is replaced idempotently and the backfill matches only empty rows.
*/

ALTER TABLE public.vendors ALTER COLUMN company_id SET DEFAULT get_user_company_id();

UPDATE public.vendors v
SET company_id = u.company_id
FROM public.users u
WHERE v.company_id IS NULL
  AND u.id = v.user_id
  AND u.company_id IS NOT NULL;
