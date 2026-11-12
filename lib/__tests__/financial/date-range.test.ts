import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateRange, resolvePeriodRange, trendBucketFor } from '../../financial/date-range';

const now = new Date(2026, 10, 12);

describe('resolvePeriodRange', () => {
  it('month covers the calendar month', () => {
    assert.deepEqual(resolvePeriodRange('month', now), { from: '2026-11-01', to: '2026-11-30' });
  });
  it('quarter covers Q4 for November', () => {
    assert.deepEqual(resolvePeriodRange('quarter', now), { from: '2026-10-01', to: '2026-12-31' });
  });
  it('year covers the calendar year', () => {
    assert.deepEqual(resolvePeriodRange('year', now), { from: '2026-01-01', to: '2026-12-31' });
  });
  it('ytd runs from Jan 1 to today', () => {
    assert.deepEqual(resolvePeriodRange('ytd', now), { from: '2026-01-01', to: '2026-11-12' });
  });
  it('week runs Monday to Sunday', () => {
    assert.deepEqual(resolvePeriodRange('week', now), { from: '2026-11-09', to: '2026-11-15' });
  });
});

describe('isValidDateRange and trendBucketFor', () => {
  it('rejects inverted ranges', () => {
    assert.equal(isValidDateRange({ from: '2026-03-31', to: '2026-01-01' }), false);
  });
  it('accepts a valid custom range', () => {
    assert.equal(isValidDateRange({ from: '2026-01-01', to: '2026-03-31' }), true);
  });
  it('buckets short ranges by day and long ranges by month', () => {
    assert.equal(trendBucketFor({ from: '2026-11-01', to: '2026-11-30' }), 'day');
    assert.equal(trendBucketFor({ from: '2026-01-01', to: '2026-12-31' }), 'month');
  });
});
