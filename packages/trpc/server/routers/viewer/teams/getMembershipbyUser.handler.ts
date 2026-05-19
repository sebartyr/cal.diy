import { getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

export async function getMembershipbyUserHandler({ ctx, input }: Options) {
  const m = await getMembership(ctx.user.id, input.teamId);
  if (!m) return null;
  return { role: m.role, accepted: m.accepted };
}
