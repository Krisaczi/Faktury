import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ATTEMPTS = 5;
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000;

let consecutiveFailures = 0;
let circuitBreakerOpenUntil = 0;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const correlationId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Circuit breaker check
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && Date.now() < circuitBreakerOpenUntil) {
    console.warn(`[${correlationId}] Circuit breaker open, skipping retry cycle`);
    return new Response(JSON.stringify({ ok: true, message: "Circuit breaker open", skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (Date.now() >= circuitBreakerOpenUntil && consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    console.info(`[${correlationId}] Circuit breaker reset after cooldown`);
    consecutiveFailures = 0;
  }

  // Find all queued/pending submission jobs with attempts remaining
  const { data: queuedJobs, error: jobsError } = await supabase
    .from("ksef_submission_jobs")
    .select("id, invoice_id, attempt_count, max_attempts, idempotency_key, status")
    .in("status", ["queued", "pending"])
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(10);

  if (jobsError) {
    console.error(`[${correlationId}] Error fetching queued jobs`, jobsError);
    return new Response(JSON.stringify({ ok: false, error: jobsError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!queuedJobs || queuedJobs.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "No queued jobs", processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let stillQueued = 0;

  for (const job of queuedJobs) {
    processed++;

    // Exponential backoff: skip if not enough time has passed since last attempt
    const backoffMs = Math.min(Math.pow(2, job.attempt_count) * 1000, 60000);
    const { data: jobRow } = await supabase
      .from("ksef_submission_jobs")
      .select("updated_at")
      .eq("id", job.id)
      .single();

    if (jobRow) {
      const lastAttempt = new Date(jobRow.updated_at).getTime();
      if (Date.now() - lastAttempt < backoffMs) {
        stillQueued++;
        continue;
      }
    }

    // Load invoice
    const { data: invoice } = await supabase
      .from("platform_invoices")
      .select("id, entity_id, ksef_number, ksef_status")
      .eq("id", job.invoice_id)
      .maybeSingle();

    if (!invoice) {
      console.warn(`[${correlationId}] Invoice ${job.invoice_id} not found, marking job failed`);
      await supabase.from("ksef_submission_jobs").update({ status: "failed", last_error: "Invoice not found", updated_at: nowIso }).eq("id", job.id);
      failed++;
      continue;
    }

    // Skip if already accepted
    if (invoice.ksef_status === "accepted" || invoice.ksef_number) {
      await supabase.from("ksef_submission_jobs").update({ status: "accepted", updated_at: nowIso }).eq("id", job.id);
      succeeded++;
      continue;
    }

    // Increment attempt count
    const newAttemptCount = job.attempt_count + 1;
    await supabase.from("ksef_submission_jobs").update({ attempt_count: newAttemptCount, updated_at: nowIso }).eq("id", job.id);

    // Delegate to the app's send-to-ksef endpoint which has the full KSeF 2.0 session-based flow.
    // The endpoint accepts service-key auth for internal calls.
    const appUrl = Deno.env.get("APP_URL") ?? "https://bezpiecznefaktury.pl";
    let result: { success: boolean; status: string; error?: string; transient: boolean; ksefNumber?: string; submissionId?: string; response: Record<string, unknown> };
    try {
      const apiRes = await fetch(`${appUrl}/api/owner/invoices/${job.invoice_id}/send-to-ksef`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
      });
      const apiData = await apiRes.json().catch(() => ({})) as Record<string, unknown>;
      const ksefStatus = (apiData.ksefStatus ?? "queued") as string;
      result = {
        success: apiRes.ok || apiData.ok === true,
        ksefNumber: apiData.ksefNumber as string | undefined,
        submissionId: apiData.submissionId as string | undefined,
        status: ksefStatus,
        response: apiData.ksefResponse as Record<string, unknown> ?? { apiResponse: apiData },
        error: apiData.error as string | undefined,
        transient: !apiRes.ok && (apiRes.status === 202 || apiRes.status >= 500),
      };
    } catch (fetchErr) {
      result = {
        success: false,
        status: "queued",
        response: { error: (fetchErr as Error).message },
        error: `Worker API call failed: ${(fetchErr as Error).message}`,
        transient: true,
      };
    }

    // Update invoice
    const updateFields: Record<string, unknown> = {
      ksef_status: result.status,
      ksef_response: result.response,
      ksef_last_attempt_at: nowIso,
    };
    if (result.ksefNumber) updateFields.ksef_number = result.ksefNumber;
    if (result.submissionId) updateFields.ksef_submission_id = result.submissionId;
    if (result.status === "submitted" || result.status === "accepted") updateFields.ksef_submitted_at = nowIso;

    await supabase.from("platform_invoices").update(updateFields).eq("id", job.invoice_id);

    // Update job
    const jobStatus = result.transient && newAttemptCount >= MAX_ATTEMPTS ? "failed" : result.status;
    await supabase.from("ksef_submission_jobs").update({ status: jobStatus, last_error: result.error ?? null, updated_at: nowIso }).eq("id", job.id);

    // Write audit entry
    await supabase.from("ksef_submission_audit").insert({
      invoice_id: job.invoice_id,
      invoice_type: "platform",
      actor_id: null,
      attempt_result: result.status,
      response_payload: result.response,
      error_message: result.error ?? null,
      correlation_id: correlationId,
    });

    if (result.success) {
      succeeded++;
      consecutiveFailures = 0;
    } else if (result.transient) {
      stillQueued++;
      consecutiveFailures++;
    } else {
      failed++;
    }

    console.info(`[${correlationId}] Job ${job.id} for invoice ${job.invoice_id}: ${result.status} (attempt ${newAttemptCount})`);
  }

  // Open circuit breaker if too many consecutive failures
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
    console.error(`[${correlationId}] Circuit breaker opened due to ${consecutiveFailures} consecutive failures`);
  }

  return new Response(JSON.stringify({
    ok: true,
    processed,
    succeeded,
    failed,
    stillQueued,
    correlationId,
    circuitBreakerOpen: consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
