/**
 * Unit tests for trial cron logic and email templates.
 *
 * Strategy: inline simulations of processTrials business rules —
 * no live DB, Resend, or server actions required.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/trial/trial-cron.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrialExpiringSoonEmail,
  buildTrialExpiredEmail,
} from '../../trial/email-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id:               string;
  name:             string;
  trial_active:     boolean;
  trial_expires_at: string | null;
}

interface Notification {
  company_id: string;
  type:       'expiring_soon' | 'expired';
  sent_at:    string;
  recipient:  string;
}

interface SendLog {
  to:      string;
  subject: string;
}

// ─── Simulated processTrials ──────────────────────────────────────────────────

function simulateProcessTrials(opts: {
  companies:     Company[];
  ownerEmails:   Record<string, string>;
  notifications: Notification[];
  now:           Date;
  dryRun?:       boolean;
  sendFails?:    Set<string>; // company ids that should simulate send failure
}): {
  expired_processed:       number;
  expiring_soon_processed: number;
  emails_sent:             number;
  errors:                  { companyId: string; type: string; error: string }[];
  sentEmails:              SendLog[];
  updatedTrialActive:      string[]; // company ids set to trial_active=false
} {
  const { companies, ownerEmails, notifications, now, dryRun = false, sendFails = new Set() } = opts;
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const errors:              { companyId: string; type: string; error: string }[] = [];
  const sentEmails:          SendLog[] = [];
  const updatedTrialActive:  string[]  = [];
  let expired_processed      = 0;
  let expiring_soon_processed = 0;
  let emails_sent            = 0;

  // Expired
  const expired = companies.filter(
    (c) => c.trial_active && c.trial_expires_at && new Date(c.trial_expires_at) <= now,
  );

  for (const company of expired) {
    const alreadySent = notifications.some(
      (n) => n.company_id === company.id && n.type === 'expired',
    );
    if (alreadySent) continue;

    if (!dryRun) updatedTrialActive.push(company.id);

    const ownerEmail = ownerEmails[company.id];
    if (!ownerEmail) {
      errors.push({ companyId: company.id, type: 'expired', error: 'No owner email found' });
      continue;
    }

    const failSend = sendFails.has(company.id);
    if (!dryRun) {
      if (failSend) {
        errors.push({ companyId: company.id, type: 'expired', error: 'Resend 500' });
      } else {
        sentEmails.push({ to: ownerEmail, subject: `expired:${company.name}` });
        emails_sent++;
      }
    }
    expired_processed++;
  }

  // Expiring soon
  const expiringSoon = companies.filter(
    (c) =>
      c.trial_active &&
      c.trial_expires_at &&
      new Date(c.trial_expires_at) > now &&
      new Date(c.trial_expires_at) <= in48h,
  );

  for (const company of expiringSoon) {
    const alreadySent = notifications.some(
      (n) => n.company_id === company.id && n.type === 'expiring_soon',
    );
    if (alreadySent) continue;

    const ownerEmail = ownerEmails[company.id];
    if (!ownerEmail) {
      errors.push({ companyId: company.id, type: 'expiring_soon', error: 'No owner email found' });
      continue;
    }

    const failSend = sendFails.has(company.id);
    if (!dryRun) {
      if (failSend) {
        errors.push({ companyId: company.id, type: 'expiring_soon', error: 'Resend 500' });
      } else {
        sentEmails.push({ to: ownerEmail, subject: `expiring_soon:${company.name}` });
        emails_sent++;
      }
    }
    expiring_soon_processed++;
  }

  return {
    expired_processed,
    expiring_soon_processed,
    emails_sent,
    errors,
    sentEmails,
    updatedTrialActive,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysFromNow(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

const NOW = new Date('2026-06-16T10:00:00Z');

// ─── Email template tests ─────────────────────────────────────────────────────

describe('buildTrialExpiringSoonEmail', () => {
  const opts = {
    companyName: 'Acme Sp. z o.o.',
    ownerEmail:  'owner@acme.pl',
    expiresAt:   new Date('2026-06-18T10:00:00Z'),
    upgradeUrl:  'https://app.example.com/pricing',
  };

  it('sets the recipient to ownerEmail', () => {
    const { to } = buildTrialExpiringSoonEmail(opts);
    assert.equal(to, 'owner@acme.pl');
  });

  it('includes company name in subject', () => {
    const { subject } = buildTrialExpiringSoonEmail(opts);
    assert.ok(subject.includes('Acme'));
  });

  it('html includes upgrade URL', () => {
    const { html } = buildTrialExpiringSoonEmail(opts);
    assert.ok(html.includes('https://app.example.com/pricing'));
  });

  it('html mentions Professional plan', () => {
    const { html } = buildTrialExpiringSoonEmail(opts);
    assert.ok(html.includes('Professional'));
  });

  it('text includes upgrade URL', () => {
    const { text } = buildTrialExpiringSoonEmail(opts);
    assert.ok(text.includes('https://app.example.com/pricing'));
  });

  it('escapes HTML in company name', () => {
    const { html } = buildTrialExpiringSoonEmail({ ...opts, companyName: '<script>XSS</script>' });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('html is a full HTML document', () => {
    const { html } = buildTrialExpiringSoonEmail(opts);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });
});

describe('buildTrialExpiredEmail', () => {
  const opts = {
    companyName: 'Beta Corp',
    ownerEmail:  'owner@beta.pl',
    upgradeUrl:  'https://app.example.com/pricing',
  };

  it('sets the recipient to ownerEmail', () => {
    const { to } = buildTrialExpiredEmail(opts);
    assert.equal(to, 'owner@beta.pl');
  });

  it('includes company name in subject', () => {
    const { subject } = buildTrialExpiredEmail(opts);
    assert.ok(subject.includes('Beta Corp'));
  });

  it('html mentions Starter plan downgrade', () => {
    const { html } = buildTrialExpiredEmail(opts);
    assert.ok(html.includes('Starter'));
  });

  it('html includes upgrade URL', () => {
    const { html } = buildTrialExpiredEmail(opts);
    assert.ok(html.includes('https://app.example.com/pricing'));
  });

  it('text includes company name', () => {
    const { text } = buildTrialExpiredEmail(opts);
    assert.ok(text.includes('Beta Corp'));
  });

  it('escapes HTML in company name', () => {
    const { html } = buildTrialExpiredEmail({ ...opts, companyName: '"Quoted" & <Special>' });
    assert.ok(!html.includes('<Special>'));
    assert.ok(html.includes('&amp;'));
  });
});

// ─── processTrials: expired trials ───────────────────────────────────────────

describe('processTrials — expired trials', () => {
  it('processes a company whose trial just expired', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm A', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const result = simulateProcessTrials({
      companies,
      ownerEmails:   { c1: 'owner@a.pl' },
      notifications: [],
      now:           NOW,
    });
    assert.equal(result.expired_processed, 1);
    assert.equal(result.emails_sent, 1);
    assert.equal(result.errors.length, 0);
    assert.ok(result.updatedTrialActive.includes('c1'));
  });

  it('skips companies with trial_active = false', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm A', trial_active: false, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@a.pl' }, notifications: [], now: NOW,
    });
    assert.equal(result.expired_processed, 0);
  });

  it('skips companies that already have an expired notification', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm A', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const notifications: Notification[] = [
      { company_id: 'c1', type: 'expired', sent_at: daysFromNow(NOW, -1), recipient: 'o@a.pl' },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@a.pl' }, notifications, now: NOW,
    });
    assert.equal(result.expired_processed, 0);
    assert.equal(result.emails_sent, 0);
  });

  it('records error when no owner email is found', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Orphan', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: {}, notifications: [], now: NOW,
    });
    assert.equal(result.expired_processed, 0);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].error.includes('owner email'));
  });

  it('records send error but still counts as processed', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm A', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const result = simulateProcessTrials({
      companies,
      ownerEmails: { c1: 'o@a.pl' },
      notifications: [],
      now: NOW,
      sendFails: new Set(['c1']),
    });
    assert.equal(result.expired_processed, 1);
    assert.equal(result.emails_sent, 0);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].error.includes('Resend'));
  });

  it('does not set trial_active=false or send email in dry_run mode', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm A', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@a.pl' }, notifications: [], now: NOW, dryRun: true,
    });
    assert.equal(result.expired_processed, 1);
    assert.equal(result.emails_sent, 0);
    assert.equal(result.sentEmails.length, 0);
    assert.equal(result.updatedTrialActive.length, 0);
  });

  it('processes multiple expired companies independently', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'A', trial_active: true, trial_expires_at: daysFromNow(NOW, -2) },
      { id: 'c2', name: 'B', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
    ];
    const result = simulateProcessTrials({
      companies,
      ownerEmails:   { c1: 'o@a.pl', c2: 'o@b.pl' },
      notifications: [],
      now:           NOW,
    });
    assert.equal(result.expired_processed, 2);
    assert.equal(result.emails_sent, 2);
  });
});

// ─── processTrials: expiring-soon trials ─────────────────────────────────────

describe('processTrials — expiring soon (48h)', () => {
  it('processes a company expiring within 48 hours', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm B', trial_active: true, trial_expires_at: daysFromNow(NOW, 1) },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@b.pl' }, notifications: [], now: NOW,
    });
    assert.equal(result.expiring_soon_processed, 1);
    assert.equal(result.emails_sent, 1);
    assert.equal(result.errors.length, 0);
    assert.equal(result.updatedTrialActive.length, 0); // should NOT flip active flag
  });

  it('skips a company expiring in more than 48 hours', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm B', trial_active: true, trial_expires_at: daysFromNow(NOW, 3) },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@b.pl' }, notifications: [], now: NOW,
    });
    assert.equal(result.expiring_soon_processed, 0);
    assert.equal(result.emails_sent, 0);
  });

  it('skips company that already received expiring_soon notification', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm B', trial_active: true, trial_expires_at: daysFromNow(NOW, 1) },
    ];
    const notifications: Notification[] = [
      { company_id: 'c1', type: 'expiring_soon', sent_at: NOW.toISOString(), recipient: 'o@b.pl' },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@b.pl' }, notifications, now: NOW,
    });
    assert.equal(result.expiring_soon_processed, 0);
  });

  it('does not flip trial_active for expiring-soon companies', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Firm B', trial_active: true, trial_expires_at: daysFromNow(NOW, 1) },
    ];
    const result = simulateProcessTrials({
      companies, ownerEmails: { c1: 'o@b.pl' }, notifications: [], now: NOW,
    });
    assert.equal(result.updatedTrialActive.length, 0);
  });
});

// ─── processTrials: mixed scenarios ──────────────────────────────────────────

describe('processTrials — mixed scenarios', () => {
  it('handles expired + expiring-soon + active-but-far in one run', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'Expired',       trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
      { id: 'c2', name: 'ExpiringSoon',  trial_active: true, trial_expires_at: daysFromNow(NOW, 1)  },
      { id: 'c3', name: 'StillRunning',  trial_active: true, trial_expires_at: daysFromNow(NOW, 5)  },
      { id: 'c4', name: 'AlreadyFalse',  trial_active: false, trial_expires_at: daysFromNow(NOW, -2) },
    ];
    const result = simulateProcessTrials({
      companies,
      ownerEmails:   { c1: 'o1@a.pl', c2: 'o2@a.pl', c3: 'o3@a.pl', c4: 'o4@a.pl' },
      notifications: [],
      now:           NOW,
    });
    assert.equal(result.expired_processed, 1);
    assert.equal(result.expiring_soon_processed, 1);
    assert.equal(result.emails_sent, 2);
  });

  it('is fully idempotent when run twice', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'A', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
      { id: 'c2', name: 'B', trial_active: true, trial_expires_at: daysFromNow(NOW, 1) },
    ];
    const notifications: Notification[] = [];
    const emails   = { c1: 'o1@a.pl', c2: 'o2@a.pl' };

    const first = simulateProcessTrials({ companies, ownerEmails: emails, notifications, now: NOW });
    // Record what was sent
    notifications.push(
      { company_id: 'c1', type: 'expired',       sent_at: NOW.toISOString(), recipient: 'o1@a.pl' },
      { company_id: 'c2', type: 'expiring_soon', sent_at: NOW.toISOString(), recipient: 'o2@a.pl' },
    );
    const second = simulateProcessTrials({ companies, ownerEmails: emails, notifications, now: NOW });

    assert.equal(first.emails_sent, 2);
    assert.equal(second.emails_sent, 0);  // idempotent
    assert.equal(second.expired_processed, 0);
    assert.equal(second.expiring_soon_processed, 0);
  });

  it('reports no errors and no emails in dry-run with mixed companies', () => {
    const companies: Company[] = [
      { id: 'c1', name: 'X', trial_active: true, trial_expires_at: daysFromNow(NOW, -1) },
      { id: 'c2', name: 'Y', trial_active: true, trial_expires_at: daysFromNow(NOW, 1) },
    ];
    const result = simulateProcessTrials({
      companies,
      ownerEmails: { c1: 'o1@x.pl', c2: 'o2@y.pl' },
      notifications: [],
      now: NOW,
      dryRun: true,
    });
    assert.equal(result.emails_sent, 0);
    assert.equal(result.sentEmails.length, 0);
    assert.equal(result.updatedTrialActive.length, 0);
    assert.equal(result.expired_processed, 1);
    assert.equal(result.expiring_soon_processed, 1);
  });
});
