// Shared helpers for audit PoCs.
// - NextAuth credentials login (extracts session-token cookie)
// - tRPC HTTP wire format (batch=1) for queries + mutations
//
// Requires Node 20+ (uses Headers.getSetCookie()). Run with `npx tsx`.

export const BASE = process.env.CAL_BASE_URL ?? "http://localhost:3000";

export type Session = { cookie: string; email: string };

function pickCookie(setCookieHeaders: string[], predicate: (raw: string) => boolean): string | undefined {
  return setCookieHeaders.find(predicate);
}

function cookieValue(raw: string): string {
  // "name=value; Path=/; HttpOnly; …" -> "name=value"
  return raw.split(";")[0];
}

/**
 * Programmatic NextAuth credentials login. Returns a `Cookie: …` header value
 * that can be passed to subsequent requests as a session jar.
 */
export async function login(email: string, password: string): Promise<Session> {
  // 1. Get CSRF token (sets next-auth.csrf-token cookie)
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrfRes.ok) throw new Error(`csrf fetch failed: ${csrfRes.status}`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfRaw = pickCookie(csrfRes.headers.getSetCookie(), (c) => c.includes("csrf-token"));
  if (!csrfRaw) throw new Error("no csrf cookie returned by /api/auth/csrf");
  const csrfCookie = cookieValue(csrfRaw);

  // 2. POST credentials. NextAuth expects form-encoded body.
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    redirect: "false",
    json: "true",
    callbackUrl: BASE,
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookie,
    },
    body,
    redirect: "manual",
  });

  const setCookies = loginRes.headers.getSetCookie();
  const sessionRaw = pickCookie(setCookies, (c) => /session-token|session.token/.test(c));
  if (!sessionRaw) {
    const text = await loginRes.text().catch(() => "");
    throw new Error(
      `login failed for ${email}: status=${loginRes.status}, no session cookie.\n` +
        `→ Often means the user has no password set. Run:\n` +
        `   EMAIL=${email} PASSWORD=${password} npx tsx scripts/dev-grant-password.ts\n` +
        `Response body (truncated): ${text.slice(0, 400)}`
    );
  }
  const sessionCookie = cookieValue(sessionRaw);

  return { cookie: `${csrfCookie}; ${sessionCookie}`, email };
}

export type TrpcResponse<T = unknown> = {
  status: number;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; httpStatus?: number };
  raw: unknown;
};

function unwrap<T>(json: unknown): TrpcResponse<T> {
  const first = Array.isArray(json) ? (json as any)[0] : (json as any)?.[0];
  if (!first) return { status: 0, ok: false, raw: json };
  if ("result" in first) {
    return {
      status: 200,
      ok: true,
      data: first.result?.data?.json as T,
      raw: json,
    };
  }
  if ("error" in first) {
    return {
      status: first.error?.data?.httpStatus ?? 500,
      ok: false,
      error: {
        code: first.error?.data?.code ?? "UNKNOWN",
        message: first.error?.message ?? "unknown",
        httpStatus: first.error?.data?.httpStatus,
      },
      raw: json,
    };
  }
  return { status: 0, ok: false, raw: json };
}

/**
 * Cal.com tRPC is exposed via Next.js split-router files. Each top-level
 * router (`teams`, `eventTypes`, `bookings`, …) lives at its own URL:
 *
 *   /api/trpc/teams/[trpc].ts        → teamsRouter
 *   /api/trpc/eventTypes/[trpc].ts   → eventTypesRouter
 *   /api/trpc/eventTypesHeavy/[trpc] → eventTypesHeavyRouter
 *
 * Procedures are referenced as `namespace.method`. We map them to the
 * right URL by splitting on the first dot.
 */
function trpcUrl(procedure: string): string {
  const dot = procedure.indexOf(".");
  if (dot === -1) throw new Error(`expected "namespace.method", got "${procedure}"`);
  const namespace = procedure.slice(0, dot);
  const method = procedure.slice(dot + 1);
  return `${BASE}/api/trpc/${namespace}/${method}`;
}

export async function trpcQuery<T = unknown>(
  sess: Session,
  procedure: string,
  input: unknown
): Promise<TrpcResponse<T>> {
  const payload = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const url = `${trpcUrl(procedure)}?batch=1&input=${payload}`;
  const res = await fetch(url, { headers: { cookie: sess.cookie } });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: res.status, ok: false, raw: text };
  }
  const out = unwrap<T>(json);
  if (!out.ok && out.status === 0) out.status = res.status;
  return out;
}

export async function trpcMutation<T = unknown>(
  sess: Session,
  procedure: string,
  input: unknown
): Promise<TrpcResponse<T>> {
  const url = `${trpcUrl(procedure)}?batch=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      cookie: sess.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ "0": { json: input } }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: res.status, ok: false, raw: text };
  }
  const out = unwrap<T>(json);
  if (!out.ok && out.status === 0) out.status = res.status;
  return out;
}
