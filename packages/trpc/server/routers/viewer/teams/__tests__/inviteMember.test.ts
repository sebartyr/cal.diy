import { MembershipRole } from "@calcom/prisma/enums";
import { afterEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const membershipFindUnique = vi.fn();
const teamFindUnique = vi.fn();
const txMock = vi.fn();
const sendTeamInviteEmail = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      get findUnique() {
        return userFindUnique;
      },
    },
    membership: {
      get findUnique() {
        return membershipFindUnique;
      },
      create: vi.fn(),
    },
    team: {
      get findUnique() {
        return teamFindUnique;
      },
    },
    verificationToken: { create: vi.fn() },
    get $transaction() {
      return txMock;
    },
  },
}));

vi.mock("@calcom/lib/constants", () => ({ WEBAPP_URL: "https://cal.example.com" }));

vi.mock("@calcom/emails/organization-email-service", () => ({
  get sendTeamInviteEmail() {
    return sendTeamInviteEmail;
  },
}));

vi.mock("@calcom/i18n/server", () => ({ getTranslation: vi.fn(async () => (k: string) => k) }));

vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => ({ error: vi.fn(), info: vi.fn() }) },
}));

vi.mock("../permissions", () => ({ requireMember: vi.fn(async () => ({ role: "ADMIN" })) }));

async function loadHandler() {
  const mod = await import("../inviteMember.handler");
  return mod.inviteMemberHandler;
}

const baseCtx = { user: { id: 1, name: "Admin", email: "admin@example.com" } as never };

describe("inviteMember — invite link (BUG-103-FORK)", () => {
  afterEach(() => vi.clearAllMocks());

  it("emails a URL-encoded callbackUrl pointing at /settings/teams with the token", async () => {
    userFindUnique.mockResolvedValueOnce({ id: 42, name: "Bob", email: "bob@example.com" });
    membershipFindUnique.mockResolvedValueOnce(null);
    txMock.mockResolvedValueOnce([]);
    teamFindUnique.mockResolvedValueOnce({ name: "Acme", parent: null, isOrganization: false });

    const handler = await loadHandler();
    await handler({
      ctx: baseCtx,
      input: { teamId: 5, email: "bob@example.com", role: MembershipRole.MEMBER },
    });

    expect(sendTeamInviteEmail).toHaveBeenCalledTimes(1);
    const { joinLink } = sendTeamInviteEmail.mock.calls[0][0];

    const url = new URL(joinLink);
    expect(url.origin + url.pathname).toBe("https://cal.example.com/auth/login");

    // The callbackUrl is a single encoded param that survives intact (the
    // nested `?inviteToken=` is not leaked into /auth/login's own query).
    expect(url.searchParams.has("inviteToken")).toBe(false);
    const callbackUrl = url.searchParams.get("callbackUrl");
    expect(callbackUrl).toMatch(/^\/settings\/teams\?inviteToken=[a-f0-9]+$/);
  });

  it("does not send an email when the invitee has no account", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const handler = await loadHandler();
    const res = await handler({
      ctx: baseCtx,
      input: { teamId: 5, email: "ghost@example.com", role: MembershipRole.MEMBER },
    });
    expect(res).toEqual({ ok: true });
    expect(sendTeamInviteEmail).not.toHaveBeenCalled();
  });
});
