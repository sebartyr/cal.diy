import { BookingStatus } from "@calcom/prisma/enums";

export type RescheduleNode = {
  uid: string;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  status: BookingStatus;
  rescheduled: boolean | null;
  fromReschedule: string | null;
  rescheduleReason: string | null;
  rescheduleRequestedAt: Date | null;
  rescheduledBy: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
};

type RescheduleSlot = {
  uid: string;
  startTime: Date;
  endTime: Date;
};

export type RescheduleHistoryEntry =
  | {
      type: "reschedule_requested";
      timestamp: Date | null;
      actor: string | null;
      reason: string | null;
      isReasonUnknown: false;
      from: RescheduleSlot;
      to: null;
    }
  | {
      type: "rescheduled";
      timestamp: Date;
      actor: string | null;
      reason: string | null;
      isReasonUnknown: boolean;
      from: RescheduleSlot;
      to: RescheduleSlot;
    };

// Bounds the walk so a corrupted fromReschedule cycle can't loop forever.
export const MAX_RESCHEDULE_CHAIN_LENGTH = 50;

export async function collectRescheduleChain({
  start,
  findByUid,
  findByFromReschedule,
  canInclude = async () => true,
}: {
  start: RescheduleNode;
  findByUid: (uid: string) => Promise<RescheduleNode | null>;
  findByFromReschedule: (uid: string) => Promise<RescheduleNode | null>;
  // The walk stops at the first node this rejects, so nothing past it is reached either.
  canInclude?: (node: RescheduleNode) => Promise<boolean>;
}): Promise<RescheduleNode[]> {
  const visited = new Set<string>([start.uid]);
  const previous: RescheduleNode[] = [];
  const next: RescheduleNode[] = [];

  let cursor: RescheduleNode | null = start;
  while (cursor?.fromReschedule && visited.size < MAX_RESCHEDULE_CHAIN_LENGTH) {
    const found: RescheduleNode | null = await findByUid(cursor.fromReschedule);
    if (!found || visited.has(found.uid) || !(await canInclude(found))) break;
    visited.add(found.uid);
    previous.push(found);
    cursor = found;
  }

  cursor = start;
  while (cursor?.rescheduled && visited.size < MAX_RESCHEDULE_CHAIN_LENGTH) {
    const found: RescheduleNode | null = await findByFromReschedule(cursor.uid);
    if (!found || visited.has(found.uid) || !(await canInclude(found))) break;
    visited.add(found.uid);
    next.push(found);
    cursor = found;
  }

  return [...previous.reverse(), start, ...next];
}

const toSlot = (node: RescheduleNode): RescheduleSlot => ({
  uid: node.uid,
  startTime: node.startTime,
  endTime: node.endTime,
});

/**
 * Bookings created before rescheduleReason existed only kept the reason in cancellationReason,
 * which a later cancel or reschedule request on that same booking overwrites. A plain reschedule
 * of it (B -> C) leaves the field untouched, and rejection writes rejectionReason instead.
 */
function isLegacyReasonIntact(successor: RescheduleNode): boolean {
  if (successor.status !== BookingStatus.CANCELLED) return true;
  const wasPlainlyRescheduled =
    !!successor.rescheduled && !successor.cancelledBy && !successor.rescheduleRequestedAt;
  return wasPlainlyRescheduled;
}

function getTransitionReason(successor: RescheduleNode): { reason: string | null; isReasonUnknown: boolean } {
  if (successor.rescheduleReason !== null) {
    return { reason: successor.rescheduleReason, isReasonUnknown: false };
  }
  if (isLegacyReasonIntact(successor)) {
    return { reason: successor.cancellationReason, isReasonUnknown: false };
  }
  return { reason: null, isReasonUnknown: true };
}

/**
 * Where each piece of data lives:
 * - host-requested reschedule: old booking gets cancelledBy, cancellationReason and rescheduleRequestedAt
 *   (the date is unknown for requests made before that column existed)
 * - actual reschedule: old booking gets rescheduledBy, the new booking gets rescheduleReason
 */
export function buildRescheduleHistory(chain: RescheduleNode[]): RescheduleHistoryEntry[] {
  const entries: RescheduleHistoryEntry[] = [];

  chain.forEach((node, index) => {
    if (!node.rescheduled) return;

    if (node.cancelledBy) {
      entries.push({
        type: "reschedule_requested",
        timestamp: node.rescheduleRequestedAt,
        actor: node.cancelledBy,
        reason: node.cancellationReason,
        isReasonUnknown: false,
        from: toSlot(node),
        to: null,
      });
    }

    const successor = chain[index + 1];
    if (!successor) return;

    entries.push({
      type: "rescheduled",
      timestamp: successor.createdAt,
      actor: node.rescheduledBy,
      ...getTransitionReason(successor),
      from: toSlot(node),
      to: toSlot(successor),
    });
  });

  return entries;
}
