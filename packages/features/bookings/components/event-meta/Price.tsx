import type { EventPrice } from "@calcom/features/bookings/types";
import { formatPrice } from "@calcom/lib/currencyConversions";

/**
 * BTC used to render through the Alby app, which added a lightning symbol around the amount.
 * With that app removed, every currency goes through formatPrice, which already renders BTC
 * as "<price> sats". displayAlternateSymbol stays in EventPrice for callers but no longer
 * changes the output.
 */
export const Price = ({ price, currency }: EventPrice) => {
  if (price === 0) return null;

  return <>{formatPrice(price, currency)}</>;
};
