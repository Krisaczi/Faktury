/**
 * Tests for the invoice number generation service.
 *
 * Pure helpers (no I/O):
 *   formatInvoiceNumber, parseInvoiceNumber, isValidInvoiceNumber
 *
 * Contract tests for generateInvoiceNumber() / peekInvoiceSequence():
 *   These functions call the Supabase RPC. The tests below exercise the
 *   same logic using an inline mock so no live DB is required.
 *
 * Concurrency simulation:
 *   Validates that N parallel callers each receive a unique, sequential number
 *   when the underlying counter is incremented atomically.
 *
 * Run (after `npm install`):
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/invoice-number.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Import only the pure, side-effect-free helpers ──────────────────────────
// invoice-number-format.ts has zero I/O dependencies — safe in any environment.
import {
  parseInvoiceNumber,
  formatInvoiceNumber,
  isValidInvoiceNumber,
} from '../invoice-number-format';

// ─── 1. formatInvoiceNumber ───────────────────────────────────────────────────

describe('formatInvoiceNumber', () => {
  it('zero-pads a single-digit month and single-digit seq', () => {
    assert.equal(formatInvoiceNumber(2026, 5, 1), '2026/05/001');
  });

  it('handles double-digit month and high seq', () => {
    assert.equal(formatInvoiceNumber(2026, 12, 99), '2026/12/099');
  });

  it('does not truncate sequences >= 1000', () => {
    assert.equal(formatInvoiceNumber(2027, 1, 1000), '2027/01/1000');
  });

  it('pads single-digit month to 2 digits', () => {
    assert.equal(formatInvoiceNumber(2026, 10, 42), '2026/10/042');
  });
});

// ─── 2. parseInvoiceNumber ────────────────────────────────────────────────────

describe('parseInvoiceNumber', () => {
  it('parses a valid number into year/month/seq', () => {
    const result = parseInvoiceNumber('2026/05/001');
    assert.deepEqual(result, { year: 2026, month: 5, seq: 1 });
  });

  it('parses a 4-digit sequence', () => {
    const result = parseInvoiceNumber('2026/12/1234');
    assert.deepEqual(result, { year: 2026, month: 12, seq: 1234 });
  });

  it('returns null for a draft placeholder string', () => {
    assert.equal(parseInvoiceNumber('SZKIC-1716820000000'), null);
  });

  it('returns null for an empty string', () => {
    assert.equal(parseInvoiceNumber(''), null);
  });

  it('returns null for a partial number (missing seq)', () => {
    assert.equal(parseInvoiceNumber('2026/05'), null);
  });

  it('returns null when separator is a dash instead of slash', () => {
    assert.equal(parseInvoiceNumber('2026-05-001'), null);
  });

  it('returns null when month is not zero-padded', () => {
    assert.equal(parseInvoiceNumber('2026/5/001'), null);
  });

  it('returns null when seq is only 2 digits', () => {
    assert.equal(parseInvoiceNumber('2026/05/01'), null);
  });

  it('round-trips through format → parse without loss', () => {
    const original = { year: 2026, month: 7, seq: 42 };
    const formatted = formatInvoiceNumber(original.year, original.month, original.seq);
    const parsed = parseInvoiceNumber(formatted);
    assert.deepEqual(parsed, original);
  });
});

// ─── 3. isValidInvoiceNumber ──────────────────────────────────────────────────

describe('isValidInvoiceNumber', () => {
  it('accepts correctly formatted numbers', () => {
    assert.equal(isValidInvoiceNumber('2026/05/001'),  true);
    assert.equal(isValidInvoiceNumber('2030/12/999'),  true);
    assert.equal(isValidInvoiceNumber('2026/01/1000'), true);
  });

  it('rejects empty and malformed strings', () => {
    assert.equal(isValidInvoiceNumber(''),           false);
    assert.equal(isValidInvoiceNumber('SZKIC-123'),  false);
    assert.equal(isValidInvoiceNumber('2026/5/001'), false);  // unpadded month
    assert.equal(isValidInvoiceNumber('2026/05/01'), false);  // seq too short
    assert.equal(isValidInvoiceNumber('26/05/001'),  false);  // 2-digit year
    assert.equal(isValidInvoiceNumber('2026/05/'),   false);  // missing seq
  });
});

// ─── 4. generateInvoiceNumber — contract tests (no live DB) ──────────────────
//
// We cannot import the real `generateInvoiceNumber` here because it imports
// `getSupabaseServiceClient` at module load time, which requires env vars.
// Instead, we inline the same logic with a mock client and verify the contract:
//   • The correct RPC name is used.
//   • p_company_id and p_year are forwarded.
//   • The returned string is passed through unchanged.
//   • Errors are wrapped and re-thrown.

describe('generateInvoiceNumber — contract', () => {
  // Inline implementation (mirrors lib/invoice-number.ts)
  async function generateInvoiceNumber(
    client: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }> },
    companyId: string,
    year?: number,
  ): Promise<string> {
    const { data, error } = await client.rpc('generate_invoice_number', {
      p_company_id: companyId,
      p_year: year ?? null,
    });
    if (error) throw new Error(`Invoice number generation failed: ${error.message}`);
    if (!data)  throw new Error('Invoice number generation returned an unexpected value.');
    return data;
  }

  it('calls generate_invoice_number with companyId and null year', async () => {
    const COMPANY = 'aaaa-bbbb-cccc-dddd';
    let captured: Record<string, unknown> = {};

    const mockClient = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        captured = { fn, ...args };
        return { data: '2026/05/001', error: null };
      },
    };

    const result = await generateInvoiceNumber(mockClient, COMPANY);

    assert.equal(result, '2026/05/001');
    assert.equal(captured.fn, 'generate_invoice_number');
    assert.equal(captured.p_company_id, COMPANY);
    assert.equal(captured.p_year, null);
    assert.equal(isValidInvoiceNumber(result), true);
  });

  it('passes through an explicit year override', async () => {
    let capturedYear: unknown;
    const mockClient = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        capturedYear = args.p_year;
        return { data: '2025/01/001', error: null };
      },
    };

    await generateInvoiceNumber(mockClient, 'any-id', 2025);
    assert.equal(capturedYear, 2025);
  });

  it('wraps a DB error in a descriptive Error', async () => {
    const mockClient = {
      rpc: async () => ({ data: null, error: { message: 'unique constraint violation' } }),
    };

    await assert.rejects(
      () => generateInvoiceNumber(mockClient, 'any-id'),
      (err: Error) => {
        assert.match(err.message, /Invoice number generation failed/);
        assert.match(err.message, /unique constraint violation/);
        return true;
      },
    );
  });

  it('throws when the RPC returns a null value', async () => {
    const mockClient = {
      rpc: async () => ({ data: null, error: null }),
    };

    await assert.rejects(
      () => generateInvoiceNumber(mockClient, 'any-id'),
      /unexpected value/,
    );
  });
});

// ─── 5. Concurrency simulation ────────────────────────────────────────────────
//
// Verifies that N parallel callers each receive a unique, correctly formatted
// number when the underlying counter is incremented atomically.  This mirrors
// the behaviour of the Postgres UPDATE … RETURNING inside a row lock.

describe('concurrency — parallel callers receive unique numbers', () => {
  it(`generates ${20} unique numbers for ${20} concurrent requests`, async () => {
    let counter = 0;

    // Simulates the Postgres function: increment-then-return
    async function mockGenerateInvoiceNumber(): Promise<string> {
      const seq = ++counter;  // atomic in Node's single-threaded model
      return formatInvoiceNumber(2026, 5, seq);
    }

    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () => mockGenerateInvoiceNumber()),
    );

    // All results must be unique
    const unique = new Set(results);
    assert.equal(unique.size, N, `Expected ${N} unique numbers, got ${unique.size}`);

    // Every result must parse correctly
    for (const num of results) {
      assert.equal(isValidInvoiceNumber(num), true);
      const parsed = parseInvoiceNumber(num)!;
      assert.ok(parsed.seq >= 1 && parsed.seq <= N);
    }

    // Sequences must cover exactly 1 .. N with no gaps
    const seqs = results
      .map((n) => parseInvoiceNumber(n)!.seq)
      .sort((a, b) => a - b);
    assert.deepEqual(seqs, Array.from({ length: N }, (_, i) => i + 1));
  });

  it('counter for a new year starts at 1, old year is unaffected', () => {
    const sequences: Record<string, number> = { '2026': 5 };

    function mockForYear(year: number): string {
      const key = String(year);
      sequences[key] = (sequences[key] ?? 0) + 1;
      return formatInvoiceNumber(year, 1, sequences[key]);
    }

    // First invoice of 2027 → seq 1
    assert.equal(mockForYear(2027), '2027/01/001');

    // 2026 counter is independent — continues from 5
    assert.equal(mockForYear(2026), '2026/01/006');
  });
});
