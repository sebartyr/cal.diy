import type { PrismaClient } from "@calcom/prisma";

export class ImpersonationRepository {
  constructor(private prismaClient: PrismaClient) {}

  async create({
    impersonatedUserId,
    impersonatedById,
  }: {
    impersonatedUserId: number;
    impersonatedById: number;
  }) {
    return this.prismaClient.impersonations.create({
      data: { impersonatedUserId, impersonatedById },
      select: { id: true, createdAt: true },
    });
  }
}
