# Billing Upgrade — RLS Audit & Deployment Checklist

## RLS Policy Audit

### `companies` table

| Policy | Command | Expression | Assessment |
|--------|---------|------------|------------|
| `Members can view own company` | SELECT | `id = get_user_company_id()` | **OK** — any company member can read their own company row |
| `Owners can update own company` | UPDATE | `id = get_user_company_id() AND role = 'owner'` | **Blocks accountants** — accountants cannot UPDATE companies via RLS |
| `Owners can delete own company` | DELETE | `id = get_user_company_id() AND role = 'owner'` | OK — destructive ops restricted to owner |
| `Authenticated users can create a company` | INSERT | `WITH CHECK (true)` | OK — onboarding flow |
| `Users can create company during onboarding` | INSERT | `get_user_company_id() IS NULL` | OK — only users without a company |

**Key finding**: The `companies` UPDATE policy restricts writes to `role = 'owner'` only.
Accountants cannot trigger a package upgrade through the RLS-scoped client.
The fix uses the **service-role client** for the upgrade write, bypassing RLS,
while still performing server-side authorization checks (role must be
`owner` or `accountant`) before the write.

### `users` table

The `users` table has SELECT policies that allow users to read their own row.
`get_user_company_id()` is a `SECURITY DEFINER` function that queries
`public.users` bypassing RLS, so it works correctly even if the user's row
has restrictive policies.

### `billing_audit` table

| Policy | Command | Expression | Assessment |
|--------|---------|------------|------------|
| `select_own_billing_audit` | SELECT | `company_id = get_user_company_id()` | OK — members can read their audit history |
| `insert_billing_audit_service` | INSERT | `WITH CHECK (false)` | **Blocks client inserts** — only service_role can insert |

The route writes audit rows via the service-role client, which is correct.

### `company_package_audit` table

| Policy | Command | Expression | Assessment |
|--------|---------|------------|------------|
| `Company members can view package audit` | SELECT | member check | OK |
| `Owner can insert package audit` | INSERT | `auth.uid() = changed_by AND role = 'owner'` | **Blocks accountants** |

The route writes via the service-role client, which bypasses this restriction.
This is intentional — accountants are allowed to trigger upgrades, and the
server-side authorization check validates the role before writing.

### Conclusion

No RLS policy changes are needed. The route correctly uses:
1. **User-authenticated client** (via `getAuthenticatedUser`) to read the
   user's `company_id` and `role` — subject to RLS, but the `users` SELECT
   policy allows self-reads.
2. **Service-role client** for the company lookup, package update, and audit
   writes — bypasses RLS intentionally, with server-side authorization
   checks enforcing who can upgrade.

---

## Deployment Checklist

### Pre-deploy

1. **Run diagnostic SQL** (`docs/billing-upgrade-diagnostics.sql`):
   - Query 1: confirm no orphaned users (company_id IS NULL)
   - Query 2: confirm no dangling company_id references
   - If either returns rows, run the appropriate remediation script

2. **Verify build**:
   ```
   npm run build
   ```
   Confirm `/api/billing/upgrade` appears in the route list.

3. **Run tests**:
   ```
   node --test lib/__tests__/billing/upgrade-route.test.ts
   node --test lib/__tests__/billing/upgrade-security.test.ts
   ```

### Post-deploy verification

1. **Test with curl** (replace TOKEN with a valid session JWT):
   ```bash
   # Should return 200 and upgrade the company
   curl -X POST https://bezpiecznefaktury.pl/api/billing/upgrade \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json"

   # Should return 401
   curl -X POST https://bezpiecznefaktury.pl/api/billing/upgrade

   # Should return 404 (non-existent company)
   # (hard to test without a mock — verify via logs)
   ```

2. **Check logs** for structured entries:
   ```
   {"level":"info","msg":"upgrade request received","requestId":"...","userId":"...","companyId":"..."}
   {"level":"info","msg":"company lookup successful","requestId":"...","productType":"starter"}
   {"level":"info","msg":"package updated successfully","requestId":"..."}
   {"level":"info","msg":"audit logs written","requestId":"..."}
   {"level":"info","msg":"upgrade successful","requestId":"..."}
   ```

3. **Verify in the UI**:
   - Log in as an accountant on a Starter plan
   - Go to Settings → Billing
   - Click "Upgrade to Professional"
   - Confirm the plan changes to Professional
   - Refresh the page and confirm the plan persists

4. **Verify audit trail**:
   ```sql
   SELECT * FROM public.billing_audit ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM public.company_package_audit ORDER BY created_at DESC LIMIT 5;
   ```
