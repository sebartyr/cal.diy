import { prisma } from "@calcom/prisma";
import type { Prisma, PrismaClient } from "@calcom/prisma/client";
import type { PartialReference } from "@calcom/types/EventManager";

import type { IBookingReferenceRepository } from "./IBookingReferenceRepository";

export class BookingReferenceRepository implements IBookingReferenceRepository {
  private prismaClient: PrismaClient;
  constructor(private deps: { prismaClient: PrismaClient }) {
    this.prismaClient = deps.prismaClient;
  }

  /**
   * If rescheduling a booking with new references from the EventManager. Delete the previous references and replace them with new ones
   */
  static async replaceBookingReferences({
    bookingId,
    newReferencesToCreate,
  }: {
    bookingId: number;
    newReferencesToCreate: PartialReference[];
  }) {
    const newReferenceTypes = newReferencesToCreate.map((reference) => reference.type);

    await prisma.bookingReference.updateMany({
      where: {
        bookingId,
        type: {
          in: newReferenceTypes,
        },
      },
      data: {
        deleted: true,
      },
    });

    await prisma.bookingReference.createMany({
      data: newReferencesToCreate.map((reference) => {
        return { ...reference, bookingId };
      }),
    });
  }

  async updateManyByBookingId(
    bookingId: number,
    data: Prisma.BookingReferenceUpdateManyMutationInput
  ): Promise<void> {
    await this.prismaClient.bookingReference.updateMany({
      where: {
        bookingId,
      },
      data,
    });
  }
}
