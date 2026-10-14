/**
 * Prisma selection for out-of-office entries sent to webhook subscribers.
 *
 * Lived in packages/app-store/zapier until the app was removed, even though its consumers are
 * the webhook scheduler and the OOO tRPC handler, neither of which is Zapier-specific.
 */
export const selectOOOEntries = {
  id: true,
  start: true,
  end: true,
  createdAt: true,
  updatedAt: true,
  notes: true,
  showNotePublicly: true,
  reason: {
    select: {
      reason: true,
      emoji: true,
    },
  },
  reasonId: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      timeZone: true,
    },
  },
  toUser: {
    select: {
      id: true,
      name: true,
      email: true,
      timeZone: true,
    },
  },
  uuid: true,
};
