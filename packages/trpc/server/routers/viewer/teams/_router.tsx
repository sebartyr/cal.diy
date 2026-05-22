import authedProcedure, { authedAdminProcedure } from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import {
  ZAcceptOrLeaveInput,
  ZAddMembersToEventTypesInput,
  ZAdminDeleteInput,
  ZAdminListInput,
  ZChangeMemberRoleInput,
  ZCreateInput,
  ZInviteMemberInput,
  ZRemoveMemberInput,
  ZTeamIdInput,
  ZUpdateInput,
} from "./schemas";

export const teamsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const { listHandler } = await import("./list.handler");
    return listHandler({ ctx });
  }),

  get: authedProcedure.input(ZTeamIdInput).query(async ({ ctx, input }) => {
    const { getHandler } = await import("./get.handler");
    return getHandler({ ctx, input });
  }),

  getMembershipbyUser: authedProcedure.input(ZTeamIdInput).query(async ({ ctx, input }) => {
    const { getMembershipbyUserHandler } = await import("./getMembershipbyUser.handler");
    return getMembershipbyUserHandler({ ctx, input });
  }),

  listMembers: authedProcedure.input(ZTeamIdInput).query(async ({ ctx, input }) => {
    const { listMembersHandler } = await import("./listMembers.handler");
    return listMembersHandler({ ctx, input });
  }),

  create: authedProcedure.input(ZCreateInput).mutation(async ({ ctx, input }) => {
    const { createHandler } = await import("./create.handler");
    return createHandler({ ctx, input });
  }),

  update: authedProcedure.input(ZUpdateInput).mutation(async ({ ctx, input }) => {
    const { updateHandler } = await import("./update.handler");
    return updateHandler({ ctx, input });
  }),

  delete: authedProcedure.input(ZTeamIdInput).mutation(async ({ ctx, input }) => {
    const { deleteHandler } = await import("./delete.handler");
    return deleteHandler({ ctx, input });
  }),

  removeMember: authedProcedure.input(ZRemoveMemberInput).mutation(async ({ ctx, input }) => {
    const { removeMemberHandler } = await import("./removeMember.handler");
    return removeMemberHandler({ ctx, input });
  }),

  changeMemberRole: authedProcedure.input(ZChangeMemberRoleInput).mutation(async ({ ctx, input }) => {
    const { changeMemberRoleHandler } = await import("./changeMemberRole.handler");
    return changeMemberRoleHandler({ ctx, input });
  }),

  inviteMember: authedProcedure.input(ZInviteMemberInput).mutation(async ({ ctx, input }) => {
    const { inviteMemberHandler } = await import("./inviteMember.handler");
    return inviteMemberHandler({ ctx, input });
  }),

  acceptOrLeave: authedProcedure.input(ZAcceptOrLeaveInput).mutation(async ({ ctx, input }) => {
    const { acceptOrLeaveHandler } = await import("./acceptOrLeave.handler");
    return acceptOrLeaveHandler({ ctx, input });
  }),

  addMembersToEventTypes: authedProcedure
    .input(ZAddMembersToEventTypesInput)
    .mutation(async ({ ctx, input }) => {
      const { addMembersToEventTypesHandler } = await import("./addMembersToEventTypes.handler");
      return addMembersToEventTypesHandler({ ctx, input });
    }),

  getActiveUserBookings: authedProcedure.input(ZTeamIdInput).query(async ({ ctx, input }) => {
    const { getActiveUserBookingsHandler } = await import("./getActiveUserBookings.handler");
    return getActiveUserBookingsHandler({ ctx, input });
  }),

  getActiveUserBreakdown: authedProcedure.input(ZTeamIdInput).query(async ({ ctx, input }) => {
    const { getActiveUserBreakdownHandler } = await import("./getActiveUserBreakdown.handler");
    return getActiveUserBreakdownHandler({ ctx, input });
  }),

  // System-admin endpoints — gated on UserPermissionRole.ADMIN, not Membership.
  adminList: authedAdminProcedure.input(ZAdminListInput).query(async ({ ctx, input }) => {
    const { adminListHandler } = await import("./adminList.handler");
    return adminListHandler({ ctx, input });
  }),

  adminDelete: authedAdminProcedure.input(ZAdminDeleteInput).mutation(async ({ ctx, input }) => {
    const { adminDeleteHandler } = await import("./adminDelete.handler");
    return adminDeleteHandler({ ctx, input });
  }),
});
