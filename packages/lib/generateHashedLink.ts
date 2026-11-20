import short from "short-uuid";

const translator = short();

/**
 * Private links grant booking access to hidden event types, so they must be unguessable: they used
 * to be uuidv5(id:Date.now()), recomputable offline from the event type id. `_id` is kept so callers
 * don't change; it no longer feeds the link.
 */
export const generateHashedLink = (_id: number | string): string => translator.fromUUID(crypto.randomUUID());
