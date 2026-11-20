import { enrichUserWithDelegationCredentialsIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import { eventTypeAppMetadataOptionalSchema } from "@calcom/app-store/zod-utils";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import type { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { z } from "zod";

const log = logger.getSubLogger({ prefix: ["getAllCredentials"] });

export type EventType = {
  userId?: number | null;
  team?: { id: number | null; parentId: number | null } | null;
  parentId?: number | null;
  metadata: z.infer<typeof EventTypeMetaDataSchema>;
} | null;

/**
 * Gets credentials from the user, team, and org if applicable
 *
 */
export const getAllCredentialsIncludeServiceAccountKey = async (
  user: { id: number; username: string | null; email: string; credentials: CredentialPayload[] },
  eventType: EventType
) => {
  const teamId = eventType?.team?.id;
  const parentId = eventType?.parentId;

  // These lookups are independent, so they run concurrently; only the org lookup depends on the profile
  const [teamCredentials, parentTeam, { profile }] = await Promise.all([
    teamId
      ? prisma.credential.findMany({
          where: {
            teamId,
          },
          select: credentialForCalendarServiceSelect,
        })
      : null,
    parentId
      ? prisma.team.findFirst({
          where: {
            eventTypes: {
              some: {
                id: parentId,
              },
            },
          },
          select: {
            credentials: {
              select: credentialForCalendarServiceSelect,
            },
          },
        })
      : null,
    new UserRepository(prisma).enrichUserWithItsProfile({
      user: user,
    }),
  ]);

  // Copied so the caller's user.credentials is not mutated
  let allCredentials = Array.isArray(user.credentials) ? [...user.credentials] : [];

  if (Array.isArray(teamCredentials)) {
    allCredentials.push(...teamCredentials);
  }

  if (parentTeam?.credentials && Array.isArray(parentTeam.credentials)) {
    allCredentials.push(...parentTeam.credentials);
  }

  if (profile?.organizationId) {
    const org = await prisma.team.findUnique({
      where: {
        id: profile.organizationId,
      },
      select: {
        credentials: {
          select: credentialForCalendarServiceSelect,
        },
      },
    });

    if (org?.credentials && Array.isArray(org.credentials)) {
      allCredentials.push(...org.credentials);
    }
  }

  // Only return CRM credentials that are enabled on the event type
  const eventTypeAppMetadata = eventTypeAppMetadataOptionalSchema.parse(eventType?.metadata?.apps);

  // Will be [credentialId]: { enabled: boolean }]
  const eventTypeCrmCredentials: Record<number, { enabled: boolean }> = {};
  const availableCredentialIds = new Set(allCredentials.map((credential) => credential.id));

  for (const appKey in eventTypeAppMetadata) {
    const app = eventTypeAppMetadata[appKey as keyof typeof eventTypeAppMetadata] as
      | { appCategories?: string[]; credentialId?: number; enabled?: boolean }
      | undefined;
    if (app?.appCategories && app.appCategories.some((category: string) => category === "crm")) {
      if (app.credentialId !== undefined) {
        const enabled = app.enabled ?? false;
        eventTypeCrmCredentials[app.credentialId] = { enabled };

        if (enabled && !availableCredentialIds.has(app.credentialId)) {
          // The credential picked on the event type was deleted (e.g. the app was uninstalled and
          // reinstalled). Without this, the CRM silently stops for the event type until someone
          // re-selects the installation on its Apps tab.
          const { replacement, candidateCount } = findReplacementCrmCredential(
            allCredentials,
            appKey,
            eventType
          );
          log.warn("Event type CRM app points to a credential that no longer exists", {
            appSlug: appKey,
            missingCredentialId: app.credentialId,
            replacementCredentialId: replacement?.id ?? null,
            candidateCount,
            ...(!replacement && { action: "re-select the installation on the event type's Apps tab" }),
          });
          if (replacement) {
            // Only the replacement may run for this app: a leftover legacy installation would
            // otherwise also pass the backwards-compatibility branch below and duplicate activities.
            for (const credential of allCredentials) {
              if (credential.appId === appKey && credential.id !== replacement.id) {
                eventTypeCrmCredentials[credential.id] = { enabled: false };
              }
            }
            eventTypeCrmCredentials[replacement.id] = { enabled: true };
          }
        }
      }
    }
  }

  allCredentials = allCredentials.filter((credential) => {
    if (!credential.type.includes("_crm") && !credential.type.includes("_other_calendar")) {
      return credential;
    }

    // Backwards compatibility: All CRM apps are triggered for every event type. Unless disabled on the event type
    // Check if the CRM app exists on the event type
    if (eventTypeCrmCredentials[credential.id]) {
      if (eventTypeCrmCredentials[credential.id].enabled) {
        return credential;
      }
    } else {
      // If the CRM app doesn't exist on the event type metadata, check that the credential belongs to the user/team/org and is an old CRM credential
      if (
        credential.type.includes("_other_calendar") &&
        (credential.userId === eventType?.userId ||
          credential.teamId === eventType?.team?.id ||
          credential.teamId === eventType?.team?.parentId ||
          credential.teamId === profile?.organizationId)
      ) {
        // If the CRM app doesn't exist on the event type metadata, assume it's an older CRM credential
        return credential;
      }
    }
  });

  const userWithDelegationCredentials = await enrichUserWithDelegationCredentialsIncludeServiceAccountKey({
    user: { ...user, credentials: allCredentials },
  });

  return userWithDelegationCredentials.credentials;
};

/**
 * The deleted credential's account can't be known any more, so a replacement is only picked when it
 * is unambiguous: a valid OAuth installation of the same app, owned by the event type's owner (its
 * team for a team event, the user for a personal one), and the only such installation. Otherwise
 * the CRM stays off for the event type rather than sending bookings to an arbitrary account.
 */
function findReplacementCrmCredential<
  T extends {
    appId: string | null;
    type: string;
    invalid?: boolean | null;
    userId: number | null;
    teamId: number | null;
  },
>(credentials: T[], appSlug: string, eventType: EventType): { replacement: T | undefined; candidateCount: number } {
  const teamId = eventType?.team?.id;
  const isOwnedByEventTypeOwner = (credential: T) =>
    teamId ? credential.teamId === teamId : !credential.teamId && credential.userId === eventType?.userId;

  const candidates = credentials.filter(
    (credential) =>
      credential.appId === appSlug &&
      credential.type.endsWith("_crm") &&
      !credential.invalid &&
      isOwnedByEventTypeOwner(credential)
  );
  return { replacement: candidates.length === 1 ? candidates[0] : undefined, candidateCount: candidates.length };
}
