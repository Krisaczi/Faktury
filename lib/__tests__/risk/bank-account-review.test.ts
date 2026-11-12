import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBankAccountReviewDetails,
  parseWhiteListStatus,
} from '../../risk/bank-account-review';

describe('parseWhiteListStatus', () => {
  it('returns a known status from stored details', () => {
    assert.equal(parseWhiteListStatus({ whiteList: { status: 'VALID' } }), 'VALID');
    assert.equal(parseWhiteListStatus({ whiteList: { status: 'NOT_FOUND' } }), 'NOT_FOUND');
  });

  it('defaults to ERROR for missing or unknown status', () => {
    assert.equal(parseWhiteListStatus(null), 'ERROR');
    assert.equal(parseWhiteListStatus({}), 'ERROR');
    assert.equal(parseWhiteListStatus({ whiteList: { status: 'MAYBE' } }), 'ERROR');
  });
});

describe('parseBankAccountReviewDetails', () => {
  it('parses a full stored finding payload', () => {
    const parsed = parseBankAccountReviewDetails({
      vendorId: 'v1',
      vendorName: 'Acme',
      newAccount: 'PL02999999999999999999999999',
      currentAccount: '...9999',
      previousAccounts: ['...1111', 42, '...2222'],
      whiteList: { status: 'INVALID', companyName: null, message: 'Not listed' },
    });
    assert.equal(parsed.vendorName, 'Acme');
    assert.equal(parsed.newAccount, 'PL02999999999999999999999999');
    assert.deepEqual(parsed.previousAccounts, ['...1111', '...2222']);
    assert.deepEqual(parsed.whiteList, { status: 'INVALID', companyName: null, message: 'Not listed' });
  });

  it('returns safe empty values for malformed details', () => {
    const parsed = parseBankAccountReviewDetails('garbage');
    assert.equal(parsed.vendorName, null);
    assert.equal(parsed.newAccount, null);
    assert.deepEqual(parsed.previousAccounts, []);
    assert.equal(parsed.whiteList, null);
  });
});
