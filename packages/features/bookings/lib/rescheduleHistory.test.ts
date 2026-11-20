import { describe, expect, it, vi } from "vitest";
import type { RescheduleNode } from "./rescheduleHistory";
import {
  buildRescheduleHistory,
  collectRescheduleChain,
  MAX_RESCHEDULE_CHAIN_LENGTH,
} from "./rescheduleHistory";

const makeNode = (overrides: Partial<RescheduleNode> & { uid: string }): RescheduleNode => ({
  startTime: new Date("2026-11-01T10:00:00Z"),
  endTime: new Date("2026-11-01T10:30:00Z"),
  createdAt: new Date("2026-10-01T09:00:00Z"),
  status: "ACCEPTED",
  rescheduled: null,
  fromReschedule: null,
  rescheduleReason: null,
  rescheduleRequestedAt: null,
  rescheduledBy: null,
  cancelledBy: null,
  cancellationReason: null,
  ...overrides,
});

const makeStore = (nodes: RescheduleNode[]) => {
  const byUid = new Map(nodes.map((node) => [node.uid, node]));
  const byFromReschedule = new Map(
    nodes.filter((node) => node.fromReschedule).map((node) => [node.fromReschedule as string, node])
  );
  return {
    findByUid: vi.fn(async (uid: string) => byUid.get(uid) ?? null),
    findByFromReschedule: vi.fn(async (uid: string) => byFromReschedule.get(uid) ?? null),
  };
};

describe("collectRescheduleChain", () => {
  const a = makeNode({ uid: "a", rescheduled: true });
  const b = makeNode({ uid: "b", rescheduled: true, fromReschedule: "a" });
  const c = makeNode({ uid: "c", fromReschedule: "b" });

  it("walks both directions from a booking in the middle of the chain", async () => {
    const store = makeStore([a, b, c]);
    const chain = await collectRescheduleChain({ start: b, ...store });
    expect(chain.map((node) => node.uid)).toEqual(["a", "b", "c"]);
  });

  it("walks backwards from the latest booking", async () => {
    const store = makeStore([a, b, c]);
    const chain = await collectRescheduleChain({ start: c, ...store });
    expect(chain.map((node) => node.uid)).toEqual(["a", "b", "c"]);
    expect(store.findByFromReschedule).not.toHaveBeenCalled();
  });

  it("walks forwards from the original booking", async () => {
    const store = makeStore([a, b, c]);
    const chain = await collectRescheduleChain({ start: a, ...store });
    expect(chain.map((node) => node.uid)).toEqual(["a", "b", "c"]);
    expect(store.findByUid).not.toHaveBeenCalled();
  });

  it("stops at the first booking it may not include, in both directions", async () => {
    const d = makeNode({ uid: "d", fromReschedule: "c" });
    const cRescheduled = { ...c, rescheduled: true };
    const store = makeStore([a, b, cRescheduled, d]);
    const chain = await collectRescheduleChain({
      start: b,
      ...store,
      canInclude: async (node) => node.uid !== "a" && node.uid !== "c",
    });
    expect(chain.map((node) => node.uid)).toEqual(["b"]);
    expect(store.findByFromReschedule).toHaveBeenCalledTimes(1);
  });

  it("stops when a linked booking no longer exists", async () => {
    const orphan = makeNode({ uid: "orphan", fromReschedule: "deleted" });
    const store = makeStore([orphan]);
    const chain = await collectRescheduleChain({ start: orphan, ...store });
    expect(chain.map((node) => node.uid)).toEqual(["orphan"]);
  });

  it("returns only the start for a pending reschedule request", async () => {
    const requested = makeNode({ uid: "req", rescheduled: true, cancelledBy: "host@example.com" });
    const store = makeStore([requested]);
    const chain = await collectRescheduleChain({ start: requested, ...store });
    expect(chain.map((node) => node.uid)).toEqual(["req"]);
  });

  it("does not loop on a cycle", async () => {
    const x = makeNode({ uid: "x", rescheduled: true, fromReschedule: "y" });
    const y = makeNode({ uid: "y", rescheduled: true, fromReschedule: "x" });
    const store = makeStore([x, y]);
    const chain = await collectRescheduleChain({ start: x, ...store });
    expect(chain.map((node) => node.uid)).toEqual(["y", "x"]);
  });

  it("caps the chain length", async () => {
    const nodes = Array.from({ length: MAX_RESCHEDULE_CHAIN_LENGTH + 10 }, (_, i) =>
      makeNode({ uid: `n${i}`, rescheduled: true, fromReschedule: i > 0 ? `n${i - 1}` : null })
    );
    const store = makeStore(nodes);
    const chain = await collectRescheduleChain({ start: nodes[0], ...store });
    expect(chain).toHaveLength(MAX_RESCHEDULE_CHAIN_LENGTH);
  });
});

describe("buildRescheduleHistory", () => {
  it("returns nothing for a booking that was never rescheduled", () => {
    expect(buildRescheduleHistory([makeNode({ uid: "a" })])).toEqual([]);
  });

  it("takes the actor from the old booking and the reason from the new one (legacy field)", () => {
    const old = makeNode({ uid: "old", rescheduled: true, rescheduledBy: "attendee@example.com" });
    const created = new Date("2026-10-15T08:00:00Z");
    const replacement = makeNode({
      uid: "new",
      fromReschedule: "old",
      createdAt: created,
      startTime: new Date("2026-11-02T10:00:00Z"),
      endTime: new Date("2026-11-02T10:30:00Z"),
      cancellationReason: "Conflit d'agenda",
    });

    expect(buildRescheduleHistory([old, replacement])).toEqual([
      {
        type: "rescheduled",
        timestamp: created,
        actor: "attendee@example.com",
        reason: "Conflit d'agenda",
        isReasonUnknown: false,
        from: { uid: "old", startTime: old.startTime, endTime: old.endTime },
        to: { uid: "new", startTime: replacement.startTime, endTime: replacement.endTime },
      },
    ]);
  });

  it("records a host request, then the attendee's reschedule", () => {
    const requestedAt = new Date("2026-11-05T08:00:00Z");
    const old = makeNode({
      uid: "old",
      status: "CANCELLED",
      rescheduled: true,
      cancelledBy: "host@example.com",
      cancellationReason: "Je suis malade",
      rescheduledBy: "attendee@example.com",
      rescheduleRequestedAt: requestedAt,
    });
    const replacement = makeNode({
      uid: "new",
      fromReschedule: "old",
      createdAt: new Date("2026-11-07T08:00:00Z"),
    });

    const history = buildRescheduleHistory([old, replacement]);

    expect(history.map((entry) => entry.type)).toEqual(["reschedule_requested", "rescheduled"]);
    expect(history[0]).toMatchObject({
      actor: "host@example.com",
      reason: "Je suis malade",
      timestamp: requestedAt,
      to: null,
    });
    expect(history[1]).toMatchObject({
      actor: "attendee@example.com",
      reason: null,
      isReasonUnknown: false,
      timestamp: replacement.createdAt,
    });
  });

  it("leaves the request date unknown for requests made before it was recorded", () => {
    const old = makeNode({
      uid: "old",
      status: "CANCELLED",
      rescheduled: true,
      cancelledBy: "host@example.com",
    });
    expect(buildRescheduleHistory([old])[0].timestamp).toBeNull();
  });

  describe("reason of a reschedule whose new booking was changed afterwards", () => {
    const old = makeNode({
      uid: "a",
      status: "CANCELLED",
      rescheduled: true,
      rescheduledBy: "attendee@example.com",
    });

    it("keeps the recorded reason even after the new booking is cancelled", () => {
      const cancelled = makeNode({
        uid: "b",
        fromReschedule: "a",
        status: "CANCELLED",
        rescheduleReason: "Conflit",
        cancellationReason: "Plus besoin",
        cancelledBy: "host@example.com",
      });
      expect(buildRescheduleHistory([old, cancelled])[0]).toMatchObject({
        reason: "Conflit",
        isReasonUnknown: false,
      });
    });

    it("marks a legacy reason as unknown once the new booking is cancelled", () => {
      const cancelled = makeNode({
        uid: "b",
        fromReschedule: "a",
        status: "CANCELLED",
        cancellationReason: "Plus besoin",
        cancelledBy: "host@example.com",
      });
      expect(buildRescheduleHistory([old, cancelled])[0]).toMatchObject({
        reason: null,
        isReasonUnknown: true,
      });
    });

    it("marks a legacy reason as unknown once a reschedule of the new booking is requested", () => {
      const requested = makeNode({
        uid: "b",
        fromReschedule: "a",
        status: "CANCELLED",
        rescheduled: true,
        cancellationReason: "Salle indisponible",
        cancelledBy: "host@example.com",
      });
      const history = buildRescheduleHistory([old, requested]);
      expect(history[0]).toMatchObject({ type: "rescheduled", reason: null, isReasonUnknown: true });
      expect(history[1]).toMatchObject({ type: "reschedule_requested", reason: "Salle indisponible" });
    });

    it("trusts a legacy reason when the new booking was itself simply rescheduled", () => {
      const movedAgain = makeNode({
        uid: "b",
        fromReschedule: "a",
        status: "CANCELLED",
        rescheduled: true,
        rescheduledBy: "attendee@example.com",
        cancellationReason: "Conflit",
      });
      expect(buildRescheduleHistory([old, movedAgain])[0]).toMatchObject({
        reason: "Conflit",
        isReasonUnknown: false,
      });
    });

    it("trusts a legacy reason when the new booking was only rejected", () => {
      const rejected = makeNode({
        uid: "b",
        fromReschedule: "a",
        status: "REJECTED",
        cancellationReason: "Conflit",
      });
      expect(buildRescheduleHistory([old, rejected])[0]).toMatchObject({
        reason: "Conflit",
        isReasonUnknown: false,
      });
    });
  });

  it("keeps a pending host request with no new booking yet", () => {
    const old = makeNode({ uid: "old", rescheduled: true, cancelledBy: "host@example.com" });
    expect(buildRescheduleHistory([old])).toEqual([
      expect.objectContaining({ type: "reschedule_requested", to: null, actor: "host@example.com" }),
    ]);
  });

  it("lists every hop of a multi-step chain in order", () => {
    const a = makeNode({ uid: "a", rescheduled: true });
    const b = makeNode({ uid: "b", rescheduled: true, fromReschedule: "a" });
    const c = makeNode({ uid: "c", fromReschedule: "b" });

    const history = buildRescheduleHistory([a, b, c]);

    expect(history.map((entry) => [entry.from.uid, entry.to?.uid])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
  });
});
