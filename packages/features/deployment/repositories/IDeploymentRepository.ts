export interface IDeploymentRepository {
  getLicenseKeyWithId(id: number): Promise<string | null>;
  getSignatureToken(id: number): Promise<string | null>;
  getDefaultConferencingAppSlug(): Promise<string | null>;
  setDefaultConferencingAppSlug(slug: string | null): Promise<void>;
}
