import assert from 'node:assert';
import { describe, it } from 'node:test';
import { normalizePlanId, getPlanLabel } from '../../plans/plan-mapping';

// Pure-logic tests for the canonical plan resolution system.
// These verify plan ID normalization and label mapping without hitting the database.

describe('normalizePlanId', () => {
  it('returns starter for null/undefined/empty', () => {
    assert.equal(normalizePlanId(null), 'starter');
    assert.equal(normalizePlanId(undefined), 'starter');
    assert.equal(normalizePlanId(''), 'starter');
  });

  it('returns starter for starter', () => {
    assert.equal(normalizePlanId('starter'), 'starter');
  });

  it('returns professional for professional', () => {
    assert.equal(normalizePlanId('professional'), 'professional');
  });

  it('normalizes pro to professional', () => {
    assert.equal(normalizePlanId('pro'), 'professional');
  });

  it('trims whitespace and lowercases', () => {
    assert.equal(normalizePlanId('  Starter  '), 'starter');
    assert.equal(normalizePlanId('PROFESSIONAL'), 'professional');
    assert.equal(normalizePlanId(' Pro '), 'professional');
  });

  it('strips carriage returns and newlines (corruption fix)', () => {
    assert.equal(normalizePlanId('starter\r\n'), 'starter');
    assert.equal(normalizePlanId('professional\r\n'), 'professional');
  });

  it('preserves individual as-is', () => {
    assert.equal(normalizePlanId('individual'), 'individual');
  });

  it('passes through unknown plan IDs (lowercased)', () => {
    assert.equal(normalizePlanId('enterprise'), 'enterprise');
  });
});

describe('getPlanLabel', () => {
  it('returns "Starter" for starter', () => {
    assert.equal(getPlanLabel('starter'), 'Starter');
  });

  it('returns "Professional" for professional', () => {
    assert.equal(getPlanLabel('professional'), 'Professional');
  });

  it('returns "Professional" for pro (alias)', () => {
    assert.equal(getPlanLabel('pro'), 'Professional');
  });

  it('returns "Indywidualny" for individual', () => {
    assert.equal(getPlanLabel('individual'), 'Indywidualny');
  });

  it('returns "Starter" for null/undefined', () => {
    assert.equal(getPlanLabel(null), 'Starter');
    assert.equal(getPlanLabel(undefined), 'Starter');
  });

  it('returns "Starter" for empty string', () => {
    assert.equal(getPlanLabel(''), 'Starter');
  });

  it('handles corrupted values with whitespace', () => {
    assert.equal(getPlanLabel('  starter  '), 'Starter');
    assert.equal(getPlanLabel('starter\r\n'), 'Starter');
  });

  it('returns the raw value for unknown plans (no default to Starter)', () => {
    assert.equal(getPlanLabel('enterprise'), 'enterprise');
  });
});

describe('Plan ID canonicalization edge cases', () => {
  it('corrupted package_type values are normalized correctly', () => {
    // Simulates the corruption found in the DB: package_type = 'starter\r\n'
    const corrupted = 'starter\r\n';
    assert.equal(normalizePlanId(corrupted), 'starter');
    assert.equal(getPlanLabel(corrupted), 'Starter');
  });

  it('pro and professional map to the same canonical ID', () => {
    assert.equal(normalizePlanId('pro'), normalizePlanId('professional'));
  });

  it('case-insensitive matching works', () => {
    assert.equal(normalizePlanId('STARTER'), 'starter');
    assert.equal(normalizePlanId('Professional'), 'professional');
  });
});
