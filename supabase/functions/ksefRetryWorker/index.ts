import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const KSEF_BASE_URLS = {
  test: "https://api-test.ksef.mf.gov.pl/v2",
  prod: "https://api.ksef.mf.gov.pl/v2",
} as const;

const MAX_ATTEMPTS = 5;
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000;

let consecutiveFailures = 0;
let circuitBreakerOpenUntil = 0;

interface KsefSubmissionResult {
  success: boolean;
  ksefNumber?: string;
  submissionId?: string;
  status: string;
  response: Record<string, unknown>;
  error?: string;
  transient: boolean;
}

function generateIdempotencyKey(invoiceId: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`ksef-submit:${invoiceId}`);
  return crypto.subtle.digest("SHA-256", data).then((buf) => {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }) as unknown as string;
}

async function hashId(invoiceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`ksef-submit:${invoiceId}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getKsefAccessToken(
  token: string,
  environment: "test" | "prod",
  companyNip: string,
): Promise<{ accessToken: string; baseUrl: string } | { error: string; transient: boolean }> {
  const baseUrl = KSEF_BASE_URLS[environment];
  try {
    const challengeRes = await fetch(`${baseUrl}/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!challengeRes.ok) return { error: `KSeF challenge failed: ${challengeRes.status}`, transient: true };
    const challenge = await challengeRes.json() as { challenge: string; timestamp: string; timestampMs: string };

    const pubKeyRes = await fetch(`${baseUrl}/security/public-key-certificates`);
    if (!pubKeyRes.ok) return { error: `KSeF public key fetch failed: ${pubKeyRes.status}`, transient: true };
    const pubKeyData = await pubKeyRes.json() as { certificates: { certificate: string; usage: string }[] };
    const tokenCert = pubKeyData.certificates?.find((c) => c.usage?.includes("token") && !c.usage.includes("symmetric"));
    if (!tokenCert) return { error: "KSeF token encryption certificate not found", transient: false };
    const pubKeyPem = `-----BEGIN CERTIFICATE-----\n${tokenCert.certificate}\n-----END CERTIFICATE-----`;

    const initRes = await fetch(`${baseUrl}/auth/ksef-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge,
        contextIdentifier: { type: "nip", value: companyNip },
        encryptedToken: "mock",
      }),
    });
    if (!initRes.ok) {
      const errBody = await initRes.text().catch(() => "");
      return { error: `KSeF auth init failed: ${initRes.status} ${errBody}`, transient: true };
    }
    const initResult = await initRes.json() as { referenceNumber: string; authenticationToken: string };

    let authToken: string | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await fetch(`${baseUrl}/auth/${initResult.referenceNumber}`, {
        headers: { Authorization: `Bearer ${initResult.authenticationToken}` },
      });
      if (statusRes.status === 200) { authToken = initResult.authenticationToken; break; }
      if (statusRes.status !== 100 && !statusRes.ok) return { error: `KSeF auth polling failed: ${statusRes.status}`, transient: true };
    }
    if (!authToken) return { error: "KSeF auth polling timed out", transient: true };

    const redeemRes = await fetch(`${baseUrl}/auth/token/redeem`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    });
    if (!redeemRes.ok) return { error: `KSeF token redeem failed: ${redeemRes.status}`, transient: true };
    const redeemResult = await redeemRes.json() as { accessToken: string };
    return { accessToken: redeemResult.accessToken, baseUrl };
  } catch (err) {
    return { error: `KSeF auth error: ${(err as Error).message}`, transient: true };
  }
}

async function submitToKsef(
  invoiceId: string,
  signedXml: string,
  idempotencyKey: string,
  token: string,
  environment: "test" | "prod",
  companyNip: string,
  existingKsefNumber: string | null,
): Promise<KsefSubmissionResult> {
  if (existingKsefNumber) {
    return { success: true, ksefNumber: existingKsefNumber, status: "accepted", response: { message: "Already submitted" }, transient: false };
  }
  const authResult = await getKsefAccessToken(token, environment, companyNip);
  if ("error" in authResult) {
    return { success: false, status: authResult.transient ? "queued" : "rejected", response: { error: authResult.error }, error: authResult.error, transient: authResult.transient };
  }
  const { accessToken, baseUrl } = authResult;
  try {
    const sendRes = await fetch(`${baseUrl}/invoices/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/octet-stream", "X-Idempotency-Key": idempotencyKey },
      body: new TextEncoder().encode(signedXml),
    });
    const responseBody = await sendRes.json().catch(() => ({})) as Record<string, unknown>;
    if (sendRes.ok || sendRes.status === 201) {
      const ksefNumber = (responseBody.ksefReferenceNumber ?? responseBody.elementReferenceNumber ?? responseBody.ksefNumber) as string | undefined;
      const submissionId = (responseBody.submissionId ?? responseBody.referenceNumber ?? responseBody.sessionId) as string | undefined;
      return { success: true, ksefNumber, submissionId, status: "submitted", response: responseBody, transient: false };
    }
    if (sendRes.status === 400 || sendRes.status === 422) {
      return { success: false, status: "rejected", response: responseBody, error: (responseBody.message ?? responseBody.error ?? "KSeF rejected the invoice") as string, transient: false };
    }
    return { success: false, status: "queued", response: responseBody, error: `KSeF send failed: HTTP ${sendRes.status}`, transient: true };
  } catch (err) {
    return { success: false, status: "queued", response: { error: (err as Error).message }, error: `KSeF send error: ${(err as Error).message}`, transient: true };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const correlationId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();

  // Circuit breaker check
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && Date.now() < circuitBreakerOpenUntil) {
    console.warn(`[${correlationId}] Circuit breaker open, skipping retry cycle`);
    return new Response(JSON.stringify({ ok: true, message: "Circuit breaker open", skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (Date.now() >= circuitBreakerOpenUntil && consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    console.info(`[${correlationId}] Circuit breaker reset after cooldown`);
    consecutiveFailures = 0;
  }

  // Find all queued submission jobs with attempts remaining
  const { data: queuedJobs, error: jobsError } = await supabase
    .from("ksef_submission_jobs")
    .select("id, invoice_id, attempt_count, max_attempts, idempotency_key")
    .eq("status", "queued")
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

    // Load company NIP
    const { data: company } = await supabase
      .from("companies")
      .select("nip")
      .eq("id", invoice.entity_id)
      .maybeSingle();

    if (!company?.nip) {
      await supabase.from("ksef_submission_jobs").update({ status: "failed", last_error: "Company NIP missing", updated_at: nowIso }).eq("id", job.id);
      failed++;
      continue;
    }

    // Load KSeF credentials
    const { data: creds } = await supabase
      .from("ksef_credentials")
      .select("token, environment")
      .eq("company_id", invoice.entity_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!creds?.token) {
      await supabase.from("ksef_submission_jobs").update({ status: "failed", last_error: "No KSeF credentials", updated_at: nowIso }).eq("id", job.id);
      failed++;
      continue;
    }

    // Increment attempt count
    const newAttemptCount = job.attempt_count + 1;
    await supabase.from("ksef_submission_jobs").update({ attempt_count: newAttemptCount, updated_at: nowIso }).eq("id", job.id);

    // Attempt submission
    const idempotencyKey = await hashId(job.invoice_id);
    const result = await submitToKsef(
      job.invoice_id,
      "", // signedXml would be rebuilt from invoice data
      idempotencyKey,
      creds.token,
      creds.environment as "test" | "prod",
      company.nip,
      invoice.ksef_number,
    );

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
