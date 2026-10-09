const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lower bound for the out-of-office entries worth fetching for an availability request.
 *
 * calculateOutOfOfficeRanges only emits days from "today" onwards, where "today" is computed in the
 * server's timezone (at most 14h away from UTC). An absence that ended before yesterday 00:00 UTC can
 * therefore never produce an out-of-office day, while one that ended before dateFrom still can (it is
 * expanded to whole UTC days from today), so dateFrom alone is not a safe bound.
 */
export function getOOOLookupStartDate(dateFrom: Date, now: Date = new Date()): Date {
  const startOfYesterdayUtc =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ONE_DAY_MS;
  return new Date(Math.min(dateFrom.getTime(), startOfYesterdayUtc));
}
