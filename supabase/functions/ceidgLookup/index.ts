import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CEIDG_BASE_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

type CeidgStatus = "active" | "suspended" | "deleted" | "inactive";

interface CeidgCompany {
  nip: string;
  name: string;
  regon: string | null;
  status: CeidgStatus;
  rawStatus: string;
  street: string | null;
  buildingNumber: string | null;
  apartmentNumber: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
}

class LookupError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  return sum % 11 === Number(nip[9]);
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function mapStatus(raw: string): CeidgStatus {
  switch (raw) {
    case "AKTYWNY": return "active";
    case "ZAWIESZONY": return "suspended";
    case "WYKRESLONY": return "deleted";
    default: return "inactive";
  }
}

export function normalizeCeidgResponse(nip: string, data: unknown): CeidgCompany | null {
  const payload = data as { firmy?: unknown[]; firma?: unknown[] } | null;
  const list = payload?.firmy ?? payload?.firma;
  const entry = Array.isArray(list)
    ? (list.find((item) => (item as Record<string, any>)?.wlasciciel?.nip === nip) as Record<string, any> | undefined)
    : undefined;
  if (!entry) return null;

  const addr = (entry.adresDzialalnosci ?? {}) as Record<string, unknown>;
  const rawStatus = clean(entry.status) ?? "";

  return {
    nip,
    name: clean(entry.nazwa) ?? "",
    regon: clean(entry.wlasciciel?.regon),
    status: mapStatus(rawStatus),
    rawStatus,
    street: clean(addr.ulica),
    buildingNumber: clean(addr.budynek),
    apartmentNumber: clean(addr.lokal),
    postalCode: clean(addr.kod),
    city: clean(addr.miasto),
    country: clean(addr.kraj) ?? "PL",
    email: clean(entry.email),
    phone: clean(entry.telefon),
    website: clean(entry.www),
  };
}

async function fetchFirmDetail(link: string, token: string): Promise<Record<string, any> | null> {
  if (!link.startsWith("https://dane.biznes.gov.pl/")) return null;
  try {
    const res = await fetch(link, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const firm = Array.isArray(body?.firma) ? body.firma[0] : body?.firma ?? body;
    return firm && typeof firm === "object" ? firm as Record<string, any> : null;
  } catch {
    return null;
  }
}

// The search endpoint ignores the NIP filter and returns unrelated firms, so only the owner-NIP match is kept.
async function resolveFirmForNip(nip: string, search: unknown, token: string): Promise<unknown> {
  const list = (search as { firmy?: unknown[] } | null)?.firmy;
  const match = Array.isArray(list)
    ? (list.find((item) => (item as Record<string, any>)?.wlasciciel?.nip === nip) as Record<string, any> | undefined)
    : undefined;
  if (!match) return null;

  const detail = typeof match.link === "string" ? await fetchFirmDetail(match.link, token) : null;
  return { firmy: [{ ...match, ...(detail ?? {}) }] };
}

async function fetchFromCeidg(nip: string, token: string): Promise<unknown> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${CEIDG_BASE_URL}?nip=${nip}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) throw new LookupError("upstream_unreachable", 502, "CEIDG unreachable");
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }

    lastStatus = res.status;
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 403) {
      throw new LookupError("ceidg_auth_failed", 502, "CEIDG rejected the access token");
    }
    if (res.status === 404) return { firma: [] };
    if (res.status === 429) {
      if (attempt === MAX_ATTEMPTS) throw new LookupError("rate_limited", 429, "CEIDG rate limit reached");
    } else if (res.status < 500) {
      throw new LookupError(`upstream_${res.status}`, 502, `CEIDG responded with ${res.status}`);
    } else if (attempt === MAX_ATTEMPTS) {
      throw new LookupError(`upstream_${res.status}`, 502, `CEIDG responded with ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw new LookupError("upstream_error", 502, `CEIDG responded with ${lastStatus}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ceidgToken = Deno.env.get("CEIDG");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    const companyId = profile?.company_id ?? null;

    const body = await req.json().catch(() => null);
    const nip = typeof body?.nip === "string" ? body.nip.trim() : "";
    if (!isValidNip(nip)) {
      return json({ error: "Invalid NIP format.", code: "invalid_nip" }, 400);
    }

    const audit = async (success: boolean, company: CeidgCompany | null, errorCode: string | null) => {
      await admin.from("ceidg_lookup_audit").insert({
        nip,
        user_id: user.id,
        company_id: companyId,
        lookup_success: success,
        ceidg_status: company?.rawStatus ?? null,
        ceidg_company_name: company?.name ?? null,
        error_code: errorCode,
      });
    };

    try {
      const { data: cached } = await admin
        .from("ceidg_cache")
        .select("response, fetched_at")
        .eq("nip", nip)
        .maybeSingle();

      let raw: unknown = null;
      let fromCache = false;
      let checkedAt = new Date().toISOString();

      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
        raw = cached.response;
        fromCache = true;
        checkedAt = cached.fetched_at;
      } else {
        if (!ceidgToken) throw new LookupError("not_configured", 500, "CEIDG token is not configured");
        raw = await resolveFirmForNip(nip, await fetchFromCeidg(nip, ceidgToken), ceidgToken);
        if (raw) {
          await admin.from("ceidg_cache").upsert({
            nip,
            response: raw,
            fetched_at: checkedAt,
          });
        }
      }

      const company = normalizeCeidgResponse(nip, raw);
      if (!company) {
        await audit(false, null, "not_found");
        return json({ error: "Company not found in CEIDG.", code: "not_found" }, 404);
      }

      await audit(true, company, null);
      return json({ company, fromCache, checkedAt });
    } catch (err) {
      if (err instanceof LookupError) {
        await audit(false, null, err.code);
        return json({ error: err.message, code: err.code }, err.httpStatus);
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: "Unable to connect to CEIDG. Try again later.", code: "internal", detail: message }, 500);
  }
});
