import short, { type SUUID } from "short-uuid";
import { randomUuidV4 } from "./randomUuidV4";

const translator = short();

/**
 * Booking uids are bearer capabilities: the public booking page, cancel/reschedule links and some
 * public tRPC procedures only need the uid. They used to be uuidv5(username:start:Date.now()), which
 * anyone could recompute offline with ~60 000 guesses per minute, so they must come from a CSPRNG.
 */
export const generateBookingUid = (): SUUID => translator.fromUUID(randomUuidV4());
