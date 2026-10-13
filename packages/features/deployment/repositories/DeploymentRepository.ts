import type { PrismaClient as PrismaClientWithExtensions } from "@calcom/prisma";
import type { PrismaClient as PrismaClientWithoutExtensions } from "@calcom/prisma/client";
import type { IDeploymentRepository } from "./IDeploymentRepository";

/// Deployment is a single-row table keyed on a fixed id.
const DEPLOYMENT_ID = 1;

export class DeploymentRepository implements IDeploymentRepository {
  constructor(private prisma: PrismaClientWithoutExtensions | PrismaClientWithExtensions) {}

  async getLicenseKeyWithId(id: number): Promise<string | null> {
    // This repository is special as it is used within prisma extensions
    const deployment = await (this.prisma as PrismaClientWithoutExtensions).deployment.findUnique({
      where: { id },
      select: { licenseKey: true },
    });
    return deployment?.licenseKey || null;
  }

  async getSignatureToken(id: number): Promise<string | null> {
    const deployment = await (this.prisma as PrismaClientWithoutExtensions).deployment.findUnique({
      where: { id },
      select: { signatureTokenEncrypted: true },
    });
    return deployment?.signatureTokenEncrypted || null;
  }

  async getDefaultConferencingAppSlug(): Promise<string | null> {
    const deployment = await (this.prisma as PrismaClientWithoutExtensions).deployment.findUnique({
      where: { id: DEPLOYMENT_ID },
      select: { defaultConferencingAppSlug: true },
    });
    return deployment?.defaultConferencingAppSlug ?? null;
  }

  async setDefaultConferencingAppSlug(slug: string | null): Promise<void> {
    // Deployment is a single-row table that may not exist yet on a fresh install.
    await (this.prisma as PrismaClientWithoutExtensions).deployment.upsert({
      where: { id: DEPLOYMENT_ID },
      update: { defaultConferencingAppSlug: slug },
      create: { id: DEPLOYMENT_ID, defaultConferencingAppSlug: slug },
    });
  }
}
