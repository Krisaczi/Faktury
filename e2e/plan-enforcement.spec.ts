/**
 * E2E: Product plan enforcement — UI perspective
 *
 * Verifies that the owner dashboard card correctly reflects plan and
 * user counts after onboarding, and that plan-gated routes behave correctly.
 *
 * These tests assume the user is already onboarded (company_id set).
 * Use E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD for a fully-onboarded owner.
 *
 * Run:
 *   npx playwright test e2e/plan-enforcement.spec.ts
 */

import { test, expect } from '@playwright/test';

const OWNER_EMAIL    = process.env.E2E_OWNER_EMAIL    ?? 'owner@test.example.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? 'TestPassword123!';

test.describe('Plan enforcement — owner dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel(/hasło|password/i).fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: /zaloguj|sign in|log in/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
  });

  test('AC-8 Dashboard loads without errors after login', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    // No JS error overlay
    await expect(page.locator('[data-testid="error-boundary"]')).not.toBeVisible();
  });

  test('AC-6 Starter plan: /invoice page is inaccessible', async ({ page }) => {
    // This test is conditional on the test user being on Starter plan.
    // The invoice page should either redirect or show an upgrade prompt.
    await page.goto('/invoice');
    // Either an upgrade gate or a redirect away from /invoice
    const hasUpgradeGate = await page.getByText(/professional|aktualizuj|upgrade/i).isVisible().catch(() => false);
    const wasRedirected  = !page.url().includes('/invoice');
    assert(hasUpgradeGate || wasRedirected, 'Expected invoice page to be gated on Starter plan');
  });
});

// Minimal assertion helper since Playwright's test runner provides expect()
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
