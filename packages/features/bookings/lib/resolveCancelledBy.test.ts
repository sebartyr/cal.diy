import { describe, expect, it, vi } from "vitest";
import { resolveCancelledBy } from "./resolveCancelledBy";

const booking = {
  userId: 101,
  user: { email: "organizer@example.com" },
  userPrimaryEmail: "organizer@example.com",
  attendees: [{ email: "Booker@Example.com" }],
  eventType: { hosts: [{ user: { email: "cohost@example.com" } }] },
};

describe("resolveCancelledBy", () => {
  it("uses the organizer email when the actor is the organizer, ignoring the claimed email", async () => {
    const findActorEmail = vi.fn();

    const result = await resolveCancelledBy({
      claimedEmail: "attacker@evil.com",
      actorUserId: 101,
      booking,
      findActorEmail,
    });

    expect(result).toBe("organizer@example.com");
    expect(findActorEmail).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor's email, ignoring the claimed email", async () => {
    const findActorEmail = vi.fn().mockResolvedValue("admin@example.com");

    const result = await resolveCancelledBy({
      claimedEmail: "organizer@example.com",
      actorUserId: 202,
      booking,
      findActorEmail,
    });

    expect(result).toBe("admin@example.com");
    expect(findActorEmail).toHaveBeenCalledWith(202);
  });

  it("falls back to participant validation when the actor cannot be found", async () => {
    const result = await resolveCancelledBy({
      claimedEmail: "attacker@evil.com",
      actorUserId: 202,
      booking,
      findActorEmail: vi.fn().mockResolvedValue(null),
    });

    expect(result).toBeUndefined();
  });

  it.each([
    ["organizer", "organizer@example.com"],
    ["attendee, case-insensitively", "booker@example.com"],
    ["event type host", "cohost@example.com"],
  ])("keeps a claimed email that belongs to the %s without a session", async (_label, email) => {
    const result = await resolveCancelledBy({
      claimedEmail: email,
      actorUserId: -1,
      booking,
      findActorEmail: vi.fn(),
    });

    expect(result).toBe(email);
  });

  it("drops a claimed email that is not part of the booking without a session", async () => {
    const findActorEmail = vi.fn();

    const result = await resolveCancelledBy({
      claimedEmail: "attacker@evil.com",
      actorUserId: undefined,
      booking,
      findActorEmail,
    });

    expect(result).toBeUndefined();
    expect(findActorEmail).not.toHaveBeenCalled();
  });

  it("returns undefined when nothing is claimed and there is no session", async () => {
    const result = await resolveCancelledBy({
      claimedEmail: undefined,
      actorUserId: -1,
      booking: { ...booking, eventType: null },
      findActorEmail: vi.fn(),
    });

    expect(result).toBeUndefined();
  });
});
