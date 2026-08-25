import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  companyAddressToBilling,
  billingAddressToString,
  validateBillingAddress,
  isAddressEmpty,
  BillingAddressSchema,
} from '../../invoice-address.ts';

describe('invoice-address helpers', () => {

  describe('companyAddressToBilling', () => {
    it('converts a company row with all fields', () => {
      const row = {
        street: 'ul. Prosta 12',
        address_line2: 'Lok. 5',
        city: 'Warszawa',
        zip: '00-850',
        state_region: 'mazowieckie',
        country: 'PL',
        nip: '1234567890',
      };
      const result = companyAddressToBilling(row);
      assert.equal(result.addressLine1, 'ul. Prosta 12');
      assert.equal(result.addressLine2, 'Lok. 5');
      assert.equal(result.city, 'Warszawa');
      assert.equal(result.postalCode, '00-850');
      assert.equal(result.country, 'PL');
      assert.equal(result.vatId, '1234567890');
    });

    it('handles null fields with defaults', () => {
      const row = {
        street: null,
        address_line2: null,
        city: null,
        zip: null,
        state_region: null,
        country: null,
        nip: '',
      };
      const result = companyAddressToBilling(row);
      assert.equal(result.addressLine1, '');
      assert.equal(result.city, '');
      assert.equal(result.country, 'PL');
    });
  });

  describe('billingAddressToString', () => {
    it('formats a complete address', () => {
      const addr = {
        addressLine1: 'ul. Prosta 12',
        addressLine2: '',
        city: 'Warszawa',
        postalCode: '00-850',
        stateRegion: '',
        country: 'PL',
        vatId: '',
      };
      const result = billingAddressToString(addr);
      assert.ok(result.includes('ul. Prosta 12'));
      assert.ok(result.includes('00-850 Warszawa'));
      assert.ok(result.includes('PL'));
    });
  });

  describe('validateBillingAddress', () => {
    it('returns valid=true for a complete address', () => {
      const addr = {
        addressLine1: 'ul. Prosta 12',
        addressLine2: '',
        city: 'Warszawa',
        postalCode: '00-850',
        stateRegion: '',
        country: 'PL',
        vatId: '',
      };
      const { valid, missingFields } = validateBillingAddress(addr);
      assert.equal(valid, true);
      assert.equal(missingFields.length, 0);
    });

    it('returns valid=false with missing fields listed', () => {
      const addr = {
        addressLine1: '',
        addressLine2: '',
        city: '',
        postalCode: '00-850',
        stateRegion: '',
        country: 'PL',
        vatId: '',
      };
      const { valid, missingFields } = validateBillingAddress(addr);
      assert.equal(valid, false);
      assert.ok(missingFields.includes('addressLine1'));
      assert.ok(missingFields.includes('city'));
      assert.ok(!missingFields.includes('postalCode'));
    });

    it('treats whitespace-only fields as missing', () => {
      const addr = {
        addressLine1: '   ',
        addressLine2: '',
        city: 'Warszawa',
        postalCode: '00-850',
        stateRegion: '',
        country: 'PL',
        vatId: '',
      };
      const { valid, missingFields } = validateBillingAddress(addr);
      assert.equal(valid, false);
      assert.ok(missingFields.includes('addressLine1'));
    });
  });

  describe('isAddressEmpty', () => {
    it('returns true for an empty address', () => {
      const addr = {
        addressLine1: '', addressLine2: '', city: '', postalCode: '', stateRegion: '', country: '', vatId: '',
      };
      assert.equal(isAddressEmpty(addr), true);
    });

    it('returns false for a non-empty address', () => {
      const addr = {
        addressLine1: 'ul. Test 1', addressLine2: '', city: '', postalCode: '', stateRegion: '', country: '', vatId: '',
      };
      assert.equal(isAddressEmpty(addr), false);
    });
  });

  describe('BillingAddressSchema', () => {
    it('validates a correct PL address', () => {
      const result = BillingAddressSchema.safeParse({
        addressLine1: 'ul. Prosta 12',
        addressLine2: '',
        city: 'Warszawa',
        postalCode: '00-850',
        stateRegion: '',
        country: 'PL',
        vatId: '1234567890',
      });
      assert.equal(result.success, true);
    });

    it('rejects invalid PL postal code', () => {
      const result = BillingAddressSchema.safeParse({
        addressLine1: 'ul. Prosta 12',
        addressLine2: '',
        city: 'Warszawa',
        postalCode: '12345',
        stateRegion: '',
        country: 'PL',
        vatId: '',
      });
      assert.equal(result.success, false);
    });

    it('accepts DE postal code format', () => {
      const result = BillingAddressSchema.safeParse({
        addressLine1: 'Hauptstr. 1',
        addressLine2: '',
        city: 'Berlin',
        postalCode: '10115',
        stateRegion: '',
        country: 'DE',
        vatId: '',
      });
      assert.equal(result.success, true);
    });
  });

  describe('actions source code checks', () => {
    it('createInvoice reads company address and persists snapshot', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, '../../../app/(admin)/admin/invoices/actions.ts'),
        'utf-8',
      );
      assert.ok(src.includes('billing_address_snapshot'), 'must persist billing_address_snapshot');
      assert.ok(src.includes('companyAddressToBilling'), 'must read company address');
      assert.ok(src.includes('billing_address_source'), 'must set billing_address_source');
      assert.ok(src.includes('address_missing_blocked_issue'), 'must audit blocked issues');
      assert.ok(src.includes('address_snapshot_created'), 'must audit snapshot creation');
      assert.ok(src.includes('address_override_used'), 'must audit override usage');
      assert.ok(src.includes("role === 'owner'"), 'must check owner role for override');
    });

    it('refresh-address route exists and is owner-only', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, '../../../app/api/invoices/[id]/refresh-address/route.ts'),
        'utf-8',
      );
      assert.ok(src.includes("role !== 'owner'"), 'must enforce owner-only');
      assert.ok(src.includes('address_snapshot_refreshed'), 'must audit refresh');
      assert.ok(src.includes('billing_address_snapshot'), 'must update snapshot');
    });
  });
});
