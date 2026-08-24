/*
# Add owner cross-company SELECT policies for platform invoicing

## Purpose
The owner needs to read data across all companies to generate platform usage invoices.
Currently, RLS on companies, profiles, vendors, invoices, and issued_invoices restricts
SELECT to the caller's own company, so the owner cannot see other companies' data.

## Changes
1. Add "Owner can view all companies" SELECT policy on `companies`
2. Add "Owner can view all profiles" SELECT policy on `profiles`
3. Add "Owner can view all vendors" SELECT policy on `vendors`
4. Add "Owner can view all invoices" SELECT policy on `invoices`
5. Add "Owner can view all issued_invoices" SELECT policy on `issued_invoices`
6. Add "Owner can view all risk_reports" SELECT policy on `risk_reports`

All policies use the existing `is_caller_owner()` helper function.
*/

-- companies: owner can view all companies
DROP POLICY IF EXISTS "Owner can view all companies" ON companies;
CREATE POLICY "Owner can view all companies"
ON companies FOR SELECT
TO authenticated
USING (is_caller_owner());

-- profiles: owner can view all profiles
DROP POLICY IF EXISTS "Owner can view all profiles" ON profiles;
CREATE POLICY "Owner can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (is_caller_owner());

-- vendors: owner can view all vendors
DROP POLICY IF EXISTS "Owner can view all vendors" ON vendors;
CREATE POLICY "Owner can view all vendors"
ON vendors FOR SELECT
TO authenticated
USING (is_caller_owner());

-- invoices: owner can view all invoices
DROP POLICY IF EXISTS "Owner can view all invoices" ON invoices;
CREATE POLICY "Owner can view all invoices"
ON invoices FOR SELECT
TO authenticated
USING (is_caller_owner());

-- issued_invoices: owner can view all issued invoices
DROP POLICY IF EXISTS "Owner can view all issued_invoices" ON issued_invoices;
CREATE POLICY "Owner can view all issued_invoices"
ON issued_invoices FOR SELECT
TO authenticated
USING (is_caller_owner());

-- risk_reports: owner can view all risk reports
DROP POLICY IF EXISTS "Owner can view all risk_reports" ON risk_reports;
CREATE POLICY "Owner can view all risk_reports"
ON risk_reports FOR SELECT
TO authenticated
USING (is_caller_owner());
