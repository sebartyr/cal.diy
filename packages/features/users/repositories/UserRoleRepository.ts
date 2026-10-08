import type { PrismaClient } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";

export type UserPermissionRoleDto = "USER" | "ADMIN";

export type UserRoleDto = {
  id: number;
  role: UserPermissionRoleDto;
  locked: boolean;
};

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

const isRootClient = (client: PrismaClientOrTransaction): client is PrismaClient => "$transaction" in client;

export class UserRoleRepository {
  constructor(private prismaClient: PrismaClientOrTransaction) {}

  async findById({ id }: { id: number }): Promise<UserRoleDto | null> {
    return this.prismaClient.user.findUnique({
      where: { id },
      select: { id: true, role: true, locked: true },
    });
  }

  async countByRole({ role }: { role: UserPermissionRoleDto }): Promise<number> {
    return this.prismaClient.user.count({ where: { role } });
  }

  async updateRole({ id, role }: { id: number; role: UserPermissionRoleDto }): Promise<UserRoleDto> {
    return this.prismaClient.user.update({
      where: { id },
      data: { role },
      select: { id: true, role: true, locked: true },
    });
  }

  /**
   * Serializable isolation is what makes the "last admin" check safe: two admins demoting each
   * other concurrently would both read count=2 under READ COMMITTED; Postgres SSI aborts one of them.
   */
  async withSerializableTransaction<T>(fn: (repository: UserRoleRepository) => Promise<T>): Promise<T> {
    if (!isRootClient(this.prismaClient)) {
      return fn(this);
    }
    return this.prismaClient.$transaction((tx) => fn(new UserRoleRepository(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
