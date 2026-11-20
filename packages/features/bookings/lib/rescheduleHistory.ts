export type RescheduleNode = {
  uid: string;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date | null;
  rescheduled: boolean | null;
  fromReschedule: string | null;
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
      from: RescheduleSlot;
      to: null;
    }
  | {
      type: "rescheduled";
      timestamp: Date;
      actor: string | null;
      reason: string | null;
      from: RescheduleSlot;
      to: RescheduleSlot;
    };

// Bounds the walk so a corrupted fromReschedule cycle can't loop forever.
export const MAX_RESCHEDULE_CHAIN_LENGTH = 50;

export async function collectRescheduleChain({
  start,
  findByUid,
  findByFromReschedule,
}: {
  start: RescheduleNode;
  findByUid: (uid: string) => Promise<RescheduleNode | null>;
  findByFromReschedule: (uid: string) => Promise<RescheduleNode | null>;
}): Promise<RescheduleNode[]> {
  const visited = new Set<string>([start.uid]);
  const previous: RescheduleNode[] = [];
  const next: RescheduleNode[] = [];

  let cursor: RescheduleNode | null = start;
  while (cursor?.fromReschedule && visited.size < MAX_RESCHEDULE_CHAIN_LENGTH) {
    const found: RescheduleNode | null = await findByUid(cursor.fromReschedule);
    if (!found || visited.has(found.uid)) break;
    visited.add(found.uid);
    previous.push(found);
    cursor = found;
  }

  cursor = start;
  while (cursor?.rescheduled && visited.size < MAX_RESCHEDULE_CHAIN_LENGTH) {
    const found: RescheduleNode | null = await findByFromReschedule(cursor.uid);
    if (!found || visited.has(found.uid)) break;
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
 * Where each piece of data lives, as written by createBooking and requestReschedule:
 * - host-requested reschedule: old booking gets cancelledBy + cancellationReason
 * - actual reschedule: old booking gets rescheduledBy, the reason lands on the NEW booking's cancellationReason
 */
export function buildRescheduleHistory(chain: RescheduleNode[]): RescheduleHistoryEntry[] {
  const entries: RescheduleHistoryEntry[] = [];

  chain.forEach((node, index) => {
    if (!node.rescheduled) return;

    if (node.cancelledBy) {
      entries.push({
        type: "reschedule_requested",
        timestamp: node.updatedAt,
        actor: node.cancelledBy,
        reason: node.cancellationReason,
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
      reason: successor.cancellationReason,
      from: toSlot(node),
      to: toSlot(successor),
    });
  });

  return entries;
}
