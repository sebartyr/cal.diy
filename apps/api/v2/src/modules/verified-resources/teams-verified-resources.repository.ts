import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class TeamsVerifiedResourcesRepository {
  constructor(private readonly dbRead: PrismaReadService, private readonly dbWrite: PrismaWriteService) {}

  async getTeamVerifiedEmails(teamId: number, skip = 0, take = 250) {
    return this.dbRead.prisma.verifiedEmail.findMany({
      where: {
        teamId,
      },
      skip,
      take,
    });
  }


  async getTeamVerifiedEmail(userId: number, email: string, teamId: number) {
    return this.dbRead.prisma.verifiedEmail.findFirstOrThrow({
      where: {
        userId,
        email,
        teamId,
      },
    });
  }


  async getTeamVerifiedEmailById(id: number, teamId: number) {
    return this.dbRead.prisma.verifiedEmail.findFirst({
      where: {
        id,
        teamId,
      },
    });
  }

}
