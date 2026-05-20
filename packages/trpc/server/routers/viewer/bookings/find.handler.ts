import type { PrismaClient } from "@calcom/prisma";

import type { TFindInputSchema } from "./find.schema";

type GetOptions = {
  ctx: {
    prisma: PrismaClient;
  };
  input: TFindInputSchema;
};

export const getHandler = async ({ ctx, input }: GetOptions) => {
  const { prisma } = ctx;
  const { bookingUid } = input;

  // SEC-012: this is a public procedure — anyone with the booking UID can
  // read this payload. The previous `select` returned `description`, which
  // is user-supplied free text (notes, reschedule reason, internal comments).
  // Drop it: the caller has the UID already, no scenario requires the
  // organizer's private notes to be returned to the world.
  const booking = await prisma.booking.findUnique({
    where: {
      uid: bookingUid,
    },
    select: {
      id: true,
      uid: true,
      startTime: true,
      endTime: true,
      status: true,
      paid: true,
      eventTypeId: true,
    },
  });

  return {
    booking,
  };
};
