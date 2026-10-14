import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { describe, expect, it } from "vitest";
import { getUsersDefaultConferencingAppHandler } from "./getUsersDefaultConferencingApp.handler";

const withMetadata = (metadata: unknown) => ({
  ctx: { user: { metadata } as unknown as NonNullable<TrpcSessionUser> },
});

describe("getUsersDefaultConferencingAppHandler", () => {
  it("returns null, not undefined, when the user has no default (React Query rejects undefined)", async () => {
    expect(await getUsersDefaultConferencingAppHandler(withMetadata({}))).toBeNull();
    expect(await getUsersDefaultConferencingAppHandler(withMetadata(null))).toBeNull();
  });

  it("returns the user's default conferencing app", async () => {
    const defaultConferencingApp = { appSlug: "zoom", appLink: "https://zoom.us/j/1" };
    expect(await getUsersDefaultConferencingAppHandler(withMetadata({ defaultConferencingApp }))).toEqual(
      defaultConferencingApp
    );
  });
});
