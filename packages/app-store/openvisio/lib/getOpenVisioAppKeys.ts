import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import { appKeysSchema } from "../zod";

export const getOpenVisioAppKeys = async () => {
  const appKeys = await getAppKeysFromSlug("openvisio");
  return appKeysSchema.parse(appKeys);
};
