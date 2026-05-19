// TEMPORARY — delete this route once webhook testing is done.
// Logs incoming payloads and always returns 200.

import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });

  let body: unknown;
  const raw = await req.text();
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }

  // eslint-disable-next-line no-console
  console.log("[webhook-sink]", new Date().toISOString(), {
    headers,
    body,
  });

  return Response.json({ received: true });
}

export async function GET() {
  return Response.json({ ok: true, hint: "POST a JSON payload here to see it logged." });
}
