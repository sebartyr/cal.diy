import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersVerifiedResourcesRepository {
  constructor(private readonly dbRead: PrismaReadService, private readonly dbWrite: PrismaWriteService) {}

  async getUserVerifiedEmails(userId: number, skip = 0, take = 250) {
    return this.dbRead.prisma.verifiedEmail.findMany({
      where: {
        userId,
      },
      skip,
      take,
    });
  }



  async getUserVerifiedEmail(userId: number, email: string) {
    return this.dbRead.prisma.verifiedEmail.findFirstOrThrow({
      where: {
        userId,
        email,
      },
    });
  }

  async findUserVerifiedEmail(userId: number, email: string) {
    return this.dbWrite.prisma.verifiedEmail.findFirst({
      where: {
        userId,
        email,
      },
    });
  }

  async createUserVerifiedEmail(userId: number, email: string) {
    return this.dbWrite.prisma.verifiedEmail.create({
      data: {
        userId,
        email,
      },
    });
  }

  async getUserVerifiedEmailById(userId: number, id: number) {
    return this.dbRead.prisma.verifiedEmail.findFirst({
      where: {
        userId,
        id,
      },
    });
  }

}
