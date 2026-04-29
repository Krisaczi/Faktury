import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json(
        { valid: false, error: "Token is required" },
        { status: 400 },
      );
    }

    const ksefBase =
      process.env.KSEF_API_BASE_URL ?? "https://ksef.mf.gov.pl/api/v2";

    const ksefRes = await fetch(`${ksefBase}/auth/walidujToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.trim()}`,
      },
      body: JSON.stringify({ token: token.trim() }),
      signal: AbortSignal.timeout(10_000),
    });

    if (ksefRes.ok) {
      return NextResponse.json({ valid: true });
    }

    const body = await ksefRes.text().catch(() => "");
    return NextResponse.json(
      {
        valid: false,
        error:
          ksefRes.status === 401
            ? "Token is invalid or expired"
            : `KSeF returned ${ksefRes.status}`,
        detail: body,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("timeout") || message.includes("abort");

    return NextResponse.json(
      {
        valid: false,
        error: isTimeout
          ? "KSeF did not respond in time — please try again"
          : "Could not reach KSeF API",
        detail: message,
      },
      { status: 200 },
    );
  }
}
