import type { GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTeamServerSideProps } from "./getServerSideProps";

const { mockTeamFindFirst, mockMembershipCount, mockMembershipFindMany } = vi.hoisted(() => ({
  mockTeamFindFirst: vi.fn(),
  mockMembershipCount: vi.fn(),
  mockMembershipFindMany: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    team: { findFirst: mockTeamFindFirst },
    membership: { count: mockMembershipCount, findMany: mockMembershipFindMany },
  },
}));

vi.mock("@calcom/lib/markdownToSafeHTML", () => ({
  markdownToSafeHTML: vi.fn(async (bio: string | null) => bio ?? ""),
}));

const team = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  name: "Team",
  slug: "team",
  bio: null,
  isPrivate: false,
  metadata: null,
  eventTypes: [],
  ...overrides,
});

const contextFor = (slug: string) => ({ query: { slug } }) as unknown as GetServerSidePropsContext;

const getProps = async (slug: string) => {
  const result = await getTeamServerSideProps(contextFor(slug));
  if (!("props" in result)) throw new Error("Expected props");
  return await result.props;
};

describe("getTeamServerSideProps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts accepted members instead of loading them", async () => {
    mockTeamFindFirst.mockResolvedValue(team());
    mockMembershipCount.mockResolvedValue(12);

    const props = await getProps("team");

    expect(mockMembershipCount).toHaveBeenCalledWith({ where: { teamId: 5, accepted: true } });
    expect(mockMembershipFindMany).not.toHaveBeenCalled();
    expect(props.memberCount).toBe(12);
    expect(props).not.toHaveProperty("members");
  });

  it("does not reveal the member count of a private team", async () => {
    mockTeamFindFirst.mockResolvedValue(team({ isPrivate: true }));

    const props = await getProps("team");

    expect(mockMembershipCount).not.toHaveBeenCalled();
    expect(props.memberCount).toBe(0);
  });

  it("reports no members for an unpublished team", async () => {
    mockTeamFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(team({ slug: null, metadata: { requestedSlug: "team" } }));

    const props = await getProps("team");

    expect(props.considerUnpublished).toBe(true);
    expect(props.memberCount).toBe(0);
    expect(mockMembershipCount).not.toHaveBeenCalled();
  });
});
