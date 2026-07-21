import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIban,
  validateBic,
  normalizeIban,
  formatIban,
  maskIban,
} from '../../validations/iban';

describe('validateIban', () => {
  it('accepts a valid Polish IBAN', () => {
    assert.equal(validateIban('PL61 1090 1014 0000 0712 1981 2874'), null);
  });

  it('accepts valid IBAN without spaces', () => {
    assert.equal(validateIban('PL61109010140000071219812874'), null);
  });

  it('accepts lowercase input', () => {
    assert.equal(validateIban('pl61109010140000071219812874'), null);
  });

  it('rejects empty string', () => {
    assert.notEqual(validateIban(''), null);
  });

  it('rejects too short IBAN', () => {
    assert.notEqual(validateIban('PL61'), null);
  });

  it('rejects invalid checksum', () => {
    assert.notEqual(validateIban('PL61 1090 1014 0000 0712 1981 2875'), null);
  });

  it('accepts a valid German IBAN', () => {
    assert.equal(validateIban('DE89 3704 0044 0532 0130 00'), null);
  });

  it('accepts a valid GB IBAN', () => {
    assert.equal(validateIban('GB29 NWBK 6016 1331 9268 19'), null);
  });

  it('rejects IBAN with invalid characters', () => {
    assert.notEqual(validateIban('PL61 1090 1014 0000 0712 1981 2!74'), null);
  });
});

describe('validateBic', () => {
  it('accepts null/empty (optional)', () => {
    assert.equal(validateBic(''), null);
  });

  it('accepts valid 8-char BIC', () => {
    assert.equal(validateBic('BANKPLPW'), null);
  });

  it('accepts valid 11-char BIC', () => {
    assert.equal(validateBic('BANKPLPWXXX'), null);
  });

  it('accepts lowercase', () => {
    assert.equal(validateBic('bankplpw'), null);
  });

  it('rejects too short BIC', () => {
    assert.notEqual(validateBic('BANK'), null);
  });

  it('rejects invalid format', () => {
    assert.notEqual(validateBic('1234PLPW'), null);
  });
});

describe('normalizeIban', () => {
  it('removes spaces and uppercases', () => {
    assert.equal(
      normalizeIban('pl61 1090 1014 0000 0712 1981 2874'),
      'PL61109010140000071219812874',
    );
  });

  it('handles already clean input', () => {
    assert.equal(
      normalizeIban('PL61109010140000071219812874'),
      'PL61109010140000071219812874',
    );
  });
});

describe('formatIban', () => {
  it('groups in 4-char blocks', () => {
    assert.equal(
      formatIban('PL61109010140000071219812874'),
      'PL61 1090 1014 0000 0712 1981 2874',
    );
  });
});

describe('maskIban', () => {
  it('masks middle digits showing last 4', () => {
    const masked = maskIban('PL61109010140000071219812874');
    assert.ok(masked.includes('2874'));
    assert.ok(masked.includes('PL'));
    assert.ok(masked.includes('•'));
  });

  it('handles short input gracefully', () => {
    assert.equal(maskIban('PL61'), 'PL61');
  });
});
