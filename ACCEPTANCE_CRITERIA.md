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

**Feature:** Step 2 lets the user choose a product plan (Starter or Professional). No trial option is offered.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 2.1 | Both "Starter" and "Professional" cards are visible on step 2 | `onboarding-happy-path.spec.ts` — "both Starter and Professional cards are visible" | After completing step 1; confirm both plan cards are rendered |
| 2.2 | Selecting Starter and clicking Next advances to step 3 | `onboarding-happy-path.spec.ts` — "AC-2 Step 2: selecting Starter and clicking Next advances to step 3" | Select Starter and click Next; confirm summary page appears |
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
| 4.1 | Starter plan (limit 1): adding a second user throws `USER_LIMIT_REACHED` | `onboarding-lifecycle.test.ts` — AC-4 "Starter plan user limit enforcement" | With a Starter company that already has 1 user, attempt to add a second via the UI; confirm error |
| 4.2 | Professional plan (limit 3): adding a third and fourth user — third succeeds, fourth is blocked | `onboarding-lifecycle.test.ts` — AC-5 "Professional plan user limit enforcement" | (Automated only — requires seeding 3 users) |
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

**Feature:** The owner dashboard card displays the correct plan name and user counts.

### Must pass

| # | Criterion | Automated test | Manual check |
|---|-----------|---------------|--------------|
| 6.1 | Dashboard loads without JavaScript errors or error boundary | `plan-enforcement.spec.ts` — "AC-8 Dashboard loads without errors after login" | Sign in as owner; open browser devtools; confirm no uncaught errors |
| 6.2 | Dashboard card shows plan name (Starter / Professional) | `onboarding-lifecycle.test.ts` — AC-3 "company card correctly reflects starter plan after onboarding" | Confirm plan label is visible on the dashboard |
| 6.3 | Dashboard card shows active user count | `onboarding-lifecycle.test.ts` — AC-7 "reports current_user_count = 2 after adding one accountant on Professional" | Add a user, reload dashboard; confirm count increments |

---

## Sign-off checklist

Before merging to `main` and deploying to production, confirm:

- [ ] All unit tests pass: `node --require ./node_modules/jiti/register.js --test "lib/__tests__/**/*.test.ts"`
- [ ] TypeScript compiles without errors: `npm run typecheck`
- [ ] Production build succeeds: `npm run build`
- [ ] E2E suite is green against staging: `npx playwright test`
- [ ] Manual walkthrough: complete the full onboarding flow end-to-end in staging
- [ ] Manual check: invoice page blocked on Starter plan in staging
- [ ] QA engineer signature: ___________________________  Date: ___________
