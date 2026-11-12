import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toIban, validateIban, formatIban } from '../../validations/iban';

const NRB = '02105010251000009083947912';
const IBAN = 'PL02105010251000009083947912';

describe('toIban', () => {
  it('prepends PL to a bare 26-digit account number', () => {
    assert.equal(toIban(NRB), IBAN);
  });

  it('leaves an existing PL IBAN unchanged', () => {
    assert.equal(toIban(IBAN), IBAN);
  });

  it('removes spaces and uppercases before normalizing', () => {
    assert.equal(toIban('pl02 1050 1025 1000 0090 8394 7912'), IBAN);
    assert.equal(toIban('02 1050 1025 1000 0090 8394 7912'), IBAN);
  });

  it('does not add PL twice', () => {
    assert.equal(toIban(toIban(NRB)), IBAN);
  });
});

describe('validateIban accepts both entry formats', () => {
  it('accepts a bare 26-digit Polish account number', () => {
    assert.equal(validateIban(NRB), null);
  });

  it('accepts the PL-prefixed IBAN', () => {
    assert.equal(validateIban(IBAN), null);
  });

  it('rejects a 26-digit number with a wrong checksum', () => {
    assert.notEqual(validateIban('02105010251000009083947913'), null);
  });
});

describe('formatIban', () => {
  it('groups a bare account number in IBAN display form', () => {
    assert.equal(formatIban(NRB), 'PL02 1050 1025 1000 0090 8394 7912');
  });
});
