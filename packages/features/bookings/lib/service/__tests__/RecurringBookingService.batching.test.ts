import { describe, expect, it, vi } from "vitest";

import { RecurringBookingService } from "../RecurringBookingService";

// BUG-006: subsequent recurring slots should run in batches of 5 in parallel
// once the first slot resolves thirdPartyRecurringEventId. We assert that by
// tracking concurrency through a stub regularBookingService that returns
// pending promises we can resolve in waves.

type Deferred = { promise: Promise<unknown>; resolve: (v: unknown) => void };
function defer(): Deferred {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeBooking(uid: string) {
  return {
    uid,
    references: [],
    responses: {},
  } as never;
}

describe("RecurringBookingService — BUG-006 batched parallelism", () => {
  it("processes slots in batches of 5 after the first sequential slot", async () => {
    const SLOTS = 12;
    const createBooking = vi.fn();
    // First call resolves immediately (sequential bootstrap), rest are deferred
    // so we can observe how many are in flight at once.
    const deferreds: Deferred[] = [];
    let callIdx = 0;
    createBooking.mockImplementation(() => {
      const idx = callIdx++;
      if (idx === 0) {
        // First sequential slot.
        return Promise.resolve(makeBooking(`uid-${idx}`));
      }
      const d = defer();
      deferreds.push(d);
      // Async resolves to a booking value when we trigger it.
      return d.promise.then(() => makeBooking(`uid-${idx}`));
    });

    const svc = new RecurringBookingService({
      // We only care about createBooking. Other methods aren't touched here.
      regularBookingService: { createBooking } as never,
    });

    const bookingData = Array.from({ length: SLOTS }, () => ({
      schedulingType: null,
      eventTypeId: 1,
      // The handler reads these — most fields are passed through; the spy
      // returns synthetic responses so the contents don't matter beyond
      // shape compatibility with handleNewRecurringBooking.
    })) as never;

    const promise = svc.createBooking({
      bookingData,
      bookingMeta: { userId: -1 },
      creationSource: "WEBAPP",
    });

    // Yield so the first sequential call (and the first Promise.all chunk
    // scheduling) gets a chance to run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // After the first slot completes synchronously, the loop should have
    // dispatched the next 5 in parallel.
    expect(deferreds.length).toBe(5);

    // Resolve that batch — next 5 should fire.
    for (const d of deferreds.splice(0, 5)) d.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(deferreds.length).toBe(5);

    // Last partial batch (12 - 1 - 5 - 5 = 1 remaining).
    for (const d of deferreds.splice(0, 5)) d.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(deferreds.length).toBe(1);

    // Drain the last one and the overall promise resolves.
    for (const d of deferreds.splice(0, 5)) d.resolve(null);
    const out = await promise;
    expect(out).toHaveLength(SLOTS);
    // Spy was called once per slot.
    expect(createBooking).toHaveBeenCalledTimes(SLOTS);
  });
});
