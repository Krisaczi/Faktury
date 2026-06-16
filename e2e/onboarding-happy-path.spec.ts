/**
 * E2E: Onboarding happy path
 *
 * A freshly-verified user can complete the 3-step onboarding wizard
 * (company data → product selection → confirmation) and land on the dashboard.
 *
 * Prerequisites:
 *   - A test Supabase project with a verified but un-onboarded user:
 *       E2E_USER_EMAIL / E2E_USER_PASSWORD env vars
 *   - App running at PLAYWRIGHT_BASE_URL (default: http://localhost:3000)
 *
 * Run:
 *   npx playwright test e2e/onboarding-happy-path.spec.ts
 */

import { test, expect } from '@playwright/test';

const EMAIL    = process.env.E2E_USER_EMAIL    ?? 'test+onboarding@example.com';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'TestPassword123!';

test.describe('Onboarding — happy path', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the login page
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/hasło|password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /zaloguj|sign in|log in/i }).click();
    // Should redirect to /onboarding (no company yet)
    await page.waitForURL('**/onboarding', { timeout: 10_000 });
  });

  test('AC-1 Step 1: company form is visible with required fields', async ({ page }) => {
    await expect(page.getByText(/dane firmy/i)).toBeVisible();
    await expect(page.getByPlaceholder(/acme/i)).toBeVisible();       // company name
    await expect(page.getByPlaceholder(/1234567890/)).toBeVisible();  // NIP
    await expect(page.getByPlaceholder(/ul\./i)).toBeVisible();       // street
  });

  test('AC-1 Step 1: validation — NIP must be 10 digits', async ({ page }) => {
    await page.getByPlaceholder(/acme/i).fill('Test Firma');
    await page.getByPlaceholder(/1234567890/).fill('12345');           // short NIP
    await page.getByRole('button', { name: /dalej/i }).click();
    await expect(page.getByText(/10 cyfr/i)).toBeVisible();
  });

  test('AC-1 Step 1: validation — all required fields must be filled', async ({ page }) => {
    // Submit empty form
    await page.getByRole('button', { name: /dalej/i }).click();
    // Multiple validation errors should appear
    const errors = page.locator('p.text-xs.text-red-500');
    await expect(errors.first()).toBeVisible();
  });

  test('AC-1 Step 1: validation — zip code format XX-XXX', async ({ page }) => {
    await page.getByPlaceholder(/acme/i).fill('Test Firma');
    await page.getByPlaceholder(/1234567890/).fill('1234567890');
    await page.getByPlaceholder(/ul\./i).fill('ul. Testowa 1');
    await page.getByPlaceholder(/00-000/).fill('00001');              // no dash
    await page.getByPlaceholder(/warszawa/i).fill('Kraków');
    await page.getByRole('button', { name: /dalej/i }).click();
    await expect(page.getByText(/XX-XXX|format kodu/i)).toBeVisible();
  });

  test('AC-1 Step 1: valid submission advances to step 2', async ({ page }) => {
    await page.getByPlaceholder(/acme/i).fill('Test Firma Sp. z o.o.');
    await page.getByPlaceholder(/1234567890/).fill('1234567890');
    await page.getByPlaceholder(/ul\./i).fill('ul. Testowa 1');
    await page.getByPlaceholder(/00-000/).fill('00-001');
    await page.getByPlaceholder(/warszawa/i).fill('Warszawa');
    await page.getByRole('button', { name: /dalej/i }).click();
    // Step 2 header visible
    await expect(page.getByText(/wybierz produkt/i)).toBeVisible({ timeout: 8_000 });
    // Step bar should show step 1 as done
    await expect(page.getByText(/dane firmy/i)).toBeVisible();
  });

  test('AC-2 Step 2: both Starter and Professional cards are visible', async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByText('Starter')).toBeVisible();
    await expect(page.getByText('Professional')).toBeVisible();
  });

  test('AC-2 Step 2: trial option is shown and selectable', async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByText(/7-dniowy okres próbny/i)).toBeVisible();
    const trialLabel = page.getByText(/7-dniowy okres próbny/i);
    await trialLabel.click();
    await page.getByRole('button', { name: /dalej/i }).click();
    // Should advance to step 3
    await expect(page.getByText(/podsumowanie/i)).toBeVisible({ timeout: 8_000 });
  });

  test('AC-2 Step 3: summary shows company name and selected plan', async ({ page }) => {
    await fillStep1(page);
    await page.getByRole('button', { name: /dalej/i }).click();        // step 2 → 3
    await expect(page.getByText(/podsumowanie/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Test Firma Sp. z o.o.')).toBeVisible();
    await expect(page.getByText('Starter')).toBeVisible();
  });

  test('AC-3 Full onboarding: submit reaches dashboard', async ({ page }) => {
    await fillStep1(page);
    await page.getByRole('button', { name: /dalej/i }).click();         // → step 3
    await page.waitForSelector('text=Podsumowanie', { timeout: 8_000 });
    await page.getByRole('button', { name: /utwórz konto/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test('AC-3 Resume: returning to /onboarding after step 1 lands on step 2', async ({ page }) => {
    // Complete step 1 only (company row saved)
    await fillStep1(page);
    // Force navigate away and back
    await page.goto('/onboarding');
    // Should skip straight to product step (company already created)
    await expect(page.getByText(/wybierz produkt/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Back button on step 2 returns to step 1', async ({ page }) => {
    await fillStep1(page);
    await page.getByRole('button', { name: /wstecz/i }).click();
    await expect(page.getByText(/dane firmy/i)).toBeVisible();
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function fillStep1(page: import('@playwright/test').Page) {
  await page.getByPlaceholder(/acme/i).fill('Test Firma Sp. z o.o.');
  await page.getByPlaceholder(/1234567890/).fill('1234567890');
  await page.getByPlaceholder(/ul\./i).fill('ul. Testowa 1');
  await page.getByPlaceholder(/00-000/).fill('00-001');
  await page.getByPlaceholder(/warszawa/i).fill('Warszawa');
  await page.getByRole('button', { name: /dalej/i }).click();
  await page.waitForSelector('text=/wybierz produkt/i', { timeout: 8_000 });
}
