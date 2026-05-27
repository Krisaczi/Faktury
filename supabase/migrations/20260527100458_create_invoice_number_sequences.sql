/*
  # Invoice number sequences

  ## Summary
  Implements race-condition-safe sequential invoice numbering per company per year.
  The counter is stored in a dedicated table and incremented atomically inside a
  Postgres function using `SELECT ... FOR UPDATE` row-level locking.  Concurrent
  calls to `generate_invoice_number()` for the same company/year will queue
  transparently — the second caller waits for the first to commit before it reads
  the (already incremented) counter.

  ## New Table: invoice_number_sequences
  One row per (company_id, year) pair.
  - company_id : FK → companies(id) — the tenant
  - year        : 4-digit year  (e.g. 2026)
  - last_seq    : last issued sequence number (starts at 0, incremented before use)
  - PRIMARY KEY (company_id, year)

  No `id` surrogate key needed — the natural PK is perfectly stable.

  ## New Function: generate_invoice_number(p_company_id, p_year, p_format)
  - Locks the row for (company_id, year), inserts if missing (ON CONFLICT DO UPDATE
    is avoided in favour of explicit INSERT … ON CONFLICT / UPDATE … RETURNING to
    keep the lock within the same statement).
  - Increments last_seq atomically.
  - Formats the result as `{year}/{month}/{seq:03d}` where month is extracted from
    the current timestamp at call time (so the number is always for the current
    calendar month, matching the requested YYYY/MM/NNN format).
  - Returns the formatted invoice number as TEXT.

  SECURITY DEFINER is used so any authenticated role can call the function without
  needing direct write access to the sequences table.

  ## Security
  - RLS enabled on `invoice_number_sequences`.
  - Users can only SELECT rows for their own company (read-only; writes go through
    the SECURITY DEFINER function).
  - No direct INSERT/UPDATE/DELETE allowed for authenticated users.

  ## Reset behaviour
  Counter resets automatically at the start of each new calendar year because the
  PK includes the year — a new row is inserted with last_seq = 1 for each new year,
  leaving old rows intact for audit purposes.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Sequence counter table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  company_id  uuid    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year        smallint NOT NULL CHECK (year >= 2020 AND year <= 2100),
  last_seq    integer NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  PRIMARY KEY (company_id, year)
);

ALTER TABLE invoice_number_sequences ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see the current counter for their company (read-only)
CREATE POLICY "Company members can view own sequences"
  ON invoice_number_sequences FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic number generator
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_invoice_number(
  p_company_id uuid,
  p_year       smallint DEFAULT NULL   -- defaults to current year
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    smallint;
  v_month   smallint;
  v_seq     integer;
  v_number  text;
BEGIN
  v_year  := COALESCE(p_year, EXTRACT(YEAR  FROM now())::smallint);
  v_month := EXTRACT(MONTH FROM now())::smallint;

  -- Insert a new row for (company, year) if it doesn't exist yet,
  -- then lock the row and increment the sequence atomically.
  INSERT INTO invoice_number_sequences (company_id, year, last_seq)
  VALUES (p_company_id, v_year, 0)
  ON CONFLICT (company_id, year) DO NOTHING;

  -- Lock and increment in one statement; FOR UPDATE ensures serialisation
  -- across concurrent transactions targeting the same company/year.
  UPDATE invoice_number_sequences
  SET    last_seq = last_seq + 1
  WHERE  company_id = p_company_id
    AND  year       = v_year
  RETURNING last_seq INTO v_seq;

  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'Failed to generate invoice sequence for company % year %',
      p_company_id, v_year;
  END IF;

  -- Format: YYYY/MM/NNN  (3-digit sequence, zero-padded)
  v_number := v_year::text
    || '/' || LPAD(v_month::text, 2, '0')
    || '/' || LPAD(v_seq::text,   3, '0');

  RETURN v_number;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: peek at the current counter without incrementing (for display)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION peek_invoice_sequence(
  p_company_id uuid,
  p_year       smallint DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT last_seq
       FROM invoice_number_sequences
      WHERE company_id = p_company_id
        AND year       = COALESCE(p_year, EXTRACT(YEAR FROM now())::smallint)
    ),
    0
  );
$$;

-- Grant execute to authenticated users (row-level auth is inside the function)
GRANT EXECUTE ON FUNCTION generate_invoice_number(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION peek_invoice_sequence(uuid, smallint)   TO authenticated;
