import type { IFeaturesRepository } from "@calcom/features/flags/features.repository.interface";

/**
 * The admin "for all users" toggle is the global Feature row, while checkIfUserHasFeature only reads
 * user and team assignments: on its own it ignored that toggle.
 */
export async function isBookingsV3Enabled(
  featuresRepository: Pick<IFeaturesRepository, "checkIfFeatureIsEnabledGlobally" | "checkIfUserHasFeature">,
  userId: number
): Promise<boolean> {
  const [globallyEnabled, enabledForUser] = await Promise.all([
    featuresRepository.checkIfFeatureIsEnabledGlobally("bookings-v3"),
    featuresRepository.checkIfUserHasFeature(userId, "bookings-v3"),
  ]);
  return globallyEnabled || enabledForUser;
}
