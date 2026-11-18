export type SelectedCalendarReference = {
  externalId: string;
  integration?: string;
  credentialId?: number | null;
};

/**
 * Selected calendars the provider no longer lists — e.g. after the account's email domain changed,
 * Google lists the calendar under its new address while the selection keeps the old one, which
 * Google still resolves as an alias. They keep blocking slots, so they must stay visible to be
 * unchecked.
 *
 * Selections saved before `credentialId` existed have none: they are matched by integration type,
 * like busy-time lookups do, and attached to the first credential of that type only so they are
 * not listed once per account.
 */
export function findUnlistedSelectedCalendars({
  selectedCalendars,
  listedExternalIds,
  credentialId,
  integrationType,
  isFirstCredentialOfType,
}: {
  selectedCalendars: SelectedCalendarReference[];
  listedExternalIds: Set<string>;
  credentialId: number;
  integrationType: string;
  isFirstCredentialOfType: boolean;
}): SelectedCalendarReference[] {
  const seenExternalIds = new Set<string>();

  return selectedCalendars.filter((selected) => {
    if (selected.integration !== integrationType) return false;
    if (listedExternalIds.has(selected.externalId)) return false;
    if (seenExternalIds.has(selected.externalId)) return false;

    const belongsToCredential =
      selected.credentialId === credentialId || (selected.credentialId == null && isFirstCredentialOfType);
    if (!belongsToCredential) return false;

    seenExternalIds.add(selected.externalId);
    return true;
  });
}
