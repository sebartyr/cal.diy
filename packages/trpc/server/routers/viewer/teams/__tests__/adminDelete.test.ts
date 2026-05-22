import { beforeEach, describe, expect, it, vi } from "vitest";

import { BookingStatus } from "@calcom/prisma/enums";

const teamFindUnique = vi.fn();
const teamDelete = vi.fn();
const bookingCount = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    team: { findUnique: (a: unknown) => teamFindUnique(a), delete: (a: unknown) => teamDelete(a) },
    booking: { count: (a: unknown) => bookingCount(a) },
  },
}));

import { adminDeleteHandler } from "../adminDelete.handler";

const ctx = { user: { id: 1 } as never };

beforeEach(() => {
  teamFindUnique.mockReset();
  teamDelete.mockReset();
  bookingCount.mockReset();
});

describe("adminDelete (SEC-306-FORK)", () => {
  it("404s when team does not exist", async () => {
    teamFindUnique.mockResolvedValueOnce(null);
    await expect(adminDeleteHandler({ ctx, input: { teamId: 1 } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to delete an organization", async () => {
    teamFindUnique.mockResolvedValueOnce({ id: 1, isOrganization: true });
    await expect(adminDeleteHandler({ ctx, input: { teamId: 1 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a team with active future bookings without force", async () => {
    teamFindUnique.mockResolvedValueOnce({ id: 1, isOrganization: false });
    bookingCount.mockResolvedValueOnce(3);
    await expect(adminDeleteHandler({ ctx, input: { teamId: 1 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("3 active future booking"),
    });
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it("deletes when there are no active bookings", async () => {
    teamFindUnique.mockResolvedValueOnce({ id: 1, isOrganization: false });
    bookingCount.mockResolvedValueOnce(0);
    teamDelete.mockResolvedValueOnce({ id: 1 });
    const result = await adminDeleteHandler({ ctx, input: { teamId: 1 } });
    expect(result).toEqual({ ok: true });
    expect(teamDelete).toHaveBeenCalledOnce();
  });

  it("deletes when force=true even with active bookings", async () => {
    teamFindUnique.mockResolvedValueOnce({ id: 1, isOrganization: false });
    teamDelete.mockResolvedValueOnce({ id: 1 });
    const result = await adminDeleteHandler({ ctx, input: { teamId: 1, force: true } });
    expect(result).toEqual({ ok: true });
    expect(bookingCount).not.toHaveBeenCalled();
    expect(teamDelete).toHaveBeenCalledOnce();
  });

  it("counts only ACCEPTED/PENDING future bookings", async () => {
    teamFindUnique.mockResolvedValueOnce({ id: 1, isOrganization: false });
    bookingCount.mockResolvedValueOnce(1);
    await expect(adminDeleteHandler({ ctx, input: { teamId: 1 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const args = bookingCount.mock.calls[0][0];
    expect(args.where.status.in).toEqual([BookingStatus.ACCEPTED, BookingStatus.PENDING]);
    expect(args.where.endTime.gt).toBeInstanceOf(Date);
  });
});
