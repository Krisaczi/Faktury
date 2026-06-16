# Acceptance Criteria — Onboarding & Product Flows

QA sign-off document. Each criterion maps to one or more automated tests and a manual verification step.

---

## AC-1 — Company Data Collection (Onboarding Step 1)

**Feature:** The onboarding wizard step 1 collects and validates company data before saving it to the database.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 1.1 | Company name, NIP, street, zip code, and city fields are visible on `/onboarding` | `onboarding-happy-path.spec.ts` — "Step 1: company form is visible" | Open `/onboarding` as a fresh user; confirm all five fields render |
| 1.2 | NIP is rejected if it is not exactly 10 digits | `onboarding-happy-path.spec.ts` — "validation — NIP must be 10 digits" | Enter `12345` in the NIP field and click Next; confirm error message |
| 1.3 | Zip code is rejected unless it matches `XX-XXX` format | `onboarding-happy-path.spec.ts` — "validation — zip code format XX-XXX" | Enter `00001` (no dash) and click Next; confirm error message |
| 1.4 | Submitting an empty form shows per-field validation errors | `onboarding-happy-path.spec.ts` — "validation — all required fields must be filled" | Click Next without filling anything; confirm multiple red error labels appear |
| 1.5 | A valid submission persists a new row in `companies` and advances to step 2 | `onboarding-happy-path.spec.ts` — "valid submission advances to step 2" | Fill valid data; confirm DB row exists and UI shows step 2 header |
| 1.6 | `createCompany` server action is idempotent — calling it twice returns the existing company | `onboarding.test.ts` — "idempotent: second call returns existing company" | (Automated only — no UI path triggers a double call) |

---

## AC-2 — Product Selection (Onboarding Step 2)

**Feature:** Step 2 lets the user choose a product plan (Starter or Professional) and optionally opt in to a 7-day trial.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 2.1 | Both "Starter" and "Professional" cards are visible on step 2 | `onboarding-happy-path.spec.ts` — "both Starter and Professional cards are visible" | After completing step 1; confirm both plan cards are rendered |
| 2.2 | A "7-day trial" option is visible and selectable | `onboarding-happy-path.spec.ts` — "trial option is shown and selectable" | Select the trial option; confirm it is visually highlighted and advances to step 3 |
| 2.3 | Step 3 (confirmation) shows the company name and selected plan | `onboarding-happy-path.spec.ts` — "Step 3: summary shows company name and selected plan" | After selecting Starter and clicking Next; confirm summary page shows correct data |

---

## AC-3 — Onboarding Completion and Resume

**Feature:** Final submission creates the company record fully and redirects to the dashboard. Returning users resume from the correct step.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 3.1 | Clicking "Create account" on the summary step calls `finalizeProduct` and redirects to `/dashboard` | `onboarding-happy-path.spec.ts` — "Full onboarding: submit reaches dashboard" | Complete all 3 steps; confirm redirect to `/dashboard` |
| 3.2 | Returning to `/onboarding` after step 1 (company saved, no product yet) skips to step 2 | `onboarding-happy-path.spec.ts` — "Resume: returning to /onboarding after step 1 lands on step 2" | Complete step 1, navigate away, return to `/onboarding`; confirm step 2 is shown immediately |
| 3.3 | Returning to `/onboarding` after full completion redirects to `/dashboard` | `onboarding-lifecycle.test.ts` — AC-3 fully completed | Sign in as a fully onboarded user and visit `/onboarding`; confirm instant redirect |
| 3.4 | Back button on step 2 returns to step 1 | `onboarding-happy-path.spec.ts` — "Back button on step 2 returns to step 1" | On step 2, click Back; confirm step 1 header is visible |

---

## AC-4 — User Slot Enforcement

**Feature:** Adding a user beyond the plan's `users_limit` is blocked with a `USER_LIMIT_REACHED` error.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 4.1 | Starter plan (limit 1): adding a second user throws `USER_LIMIT_REACHED` | `onboarding-lifecycle.test.ts` — AC-4 "Starter: adding 2nd user is blocked" | With a Starter company that already has 1 user, attempt to add a second via the UI; confirm error |
| 4.2 | Professional plan (limit 3): adding a third and fourth user — third succeeds, fourth is blocked | `onboarding-lifecycle.test.ts` — AC-4 "Professional: 3rd user ok, 4th blocked" | (Automated only — requires seeding 3 users) |
| 4.3 | Unlimited plan: any number of users can be added | `onboarding-lifecycle.test.ts` — AC-4 "Unlimited: any number of users allowed" | (Automated only) |
| 4.4 | Error payload contains `{ code: 'USER_LIMIT_REACHED', status: 403 }` | `enforcement.test.ts` — "requireUserSlot throws USER_LIMIT_REACHED" | (Automated only) |

---

## AC-5 — Invoicing Feature Gating

**Feature:** The invoicing/invoice generation feature is only available on the Professional plan. Starter plan users see an upgrade prompt.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 5.1 | Starter plan: `checkInvoicingAccess` throws `INVOICING_NOT_AVAILABLE` | `enforcement.test.ts` — "Starter plan throws INVOICING_NOT_AVAILABLE" | (Automated only) |
| 5.2 | Professional plan: `checkInvoicingAccess` passes without error | `enforcement.test.ts` — "Professional plan allows invoicing" | On a Professional company, open the invoice page; confirm it loads |
| 5.3 | `/invoice` route shows an upgrade prompt or redirects when accessed on Starter | `plan-enforcement.spec.ts` — "AC-6 Starter plan: /invoice page is inaccessible" | Sign in as a Starter user and navigate to `/invoice`; confirm upgrade UI or redirect |

---

## AC-6 — Dashboard Plan Card

**Feature:** The owner dashboard card displays the correct plan name, trial status, and user counts.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 6.1 | Dashboard loads without JavaScript errors or error boundary | `plan-enforcement.spec.ts` — "AC-8 Dashboard loads without errors after login" | Sign in as owner; open browser devtools; confirm no uncaught errors |
| 6.2 | Dashboard card shows plan name (Starter / Professional) | `onboarding-lifecycle.test.ts` — AC-6 "company card shows correct plan" | Confirm plan label is visible on the dashboard |
| 6.3 | Dashboard card shows active user count | `onboarding-lifecycle.test.ts` — AC-6 "company card shows correct user count" | Add a user, reload dashboard; confirm count increments |

---

## AC-7 — Trial Lifecycle

**Feature:** A 7-day trial starts on the day the owner selects it during onboarding. The system sends an "expiring soon" warning at 48 h remaining, and an "expired" notice when it ends.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 7.1 | Trial badge is visible in the UI when trial is active | `plan-enforcement.spec.ts` — "AC-7 Trial badge is shown when trial is active" | Sign in as an owner in an active trial; confirm trial badge/label is visible |
| 7.2 | `trial_expires_at` is set to `now() + 7 days` when trial is selected | `onboarding-lifecycle.test.ts` — AC-7 "trial_expires_at set to now + 7 days" | Check the `companies` table after onboarding with trial selected |
| 7.3 | Cron marks `trial_active = false` for trials that have passed `trial_expires_at` | `trial-cron.test.ts` — "expired trial: sets trial_active=false" | Set a company's `trial_expires_at` to yesterday in staging; run cron; confirm `trial_active` flipped |
| 7.4 | "Expired" email is sent to the owner's email address | `trial-cron.test.ts` — "expired trial: sends expired email" | Check email inbox for the company's owner in staging after running the cron |
| 7.5 | "Expiring soon" email is sent when `trial_expires_at` is within 48 h | `trial-cron.test.ts` — "expiring soon: sends email for company expiring within 48h" | Set `trial_expires_at` to 24 h from now; run cron; check inbox |
| 7.6 | "Expired" email is NOT re-sent on subsequent cron runs (idempotency) | `trial-cron.test.ts` — "expired: idempotent — skips company already notified" | Run cron twice; confirm only one `trial_notifications` row per company |
| 7.7 | Dry-run mode processes without sending emails or writing to the database | `trial-cron.test.ts` — "dry-run: does not send email or flip trial_active" | Call `POST /api/trial/check-status` with `dryRun: true`; confirm `emails_sent = 0` |

---

## AC-8 — Cron Endpoint Security

**Feature:** The `/api/trial/check-status` endpoint requires a valid `x-cron-secret` header and returns a structured JSON response.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 8.1 | Request without `x-cron-secret` returns HTTP 401 (when secret is configured) | `trial-cron-smoke.spec.ts` — "returns 401 without cron secret" | `curl -X POST /api/trial/check-status` without header; confirm 401 in production |
| 8.2 | Request with valid secret and `dryRun: true` returns HTTP 200 with valid shape | `trial-cron-smoke.spec.ts` — "dry-run returns valid shape" | Run the nightly smoke test job in GitHub Actions; confirm green |
| 8.3 | Response body contains `expired_processed`, `expiring_soon_processed`, `emails_sent`, `errors[]`, `dry_run` | `trial-cron-smoke.spec.ts` — field shape assertions | Inspect the response JSON from a dry-run call |

---

## Sign-off checklist

Before merging to `main` and deploying to production, confirm:

- [ ] All unit tests pass: `node --require ./node_modules/jiti/register.js --test "lib/__tests__/**/*.test.ts"`
- [ ] TypeScript compiles without errors: `npm run typecheck`
- [ ] Production build succeeds: `npm run build`
- [ ] E2E suite is green against staging: `npx playwright test`
- [ ] Nightly cron smoke passes in GitHub Actions (check the `trial-cron-smoke` job)
- [ ] Manual walkthrough: complete the full onboarding flow end-to-end in staging
- [ ] Manual check: trial expiry email received in staging inbox
- [ ] Manual check: invoice page blocked on Starter plan in staging
- [ ] QA engineer signature: ___________________________  Date: ___________
