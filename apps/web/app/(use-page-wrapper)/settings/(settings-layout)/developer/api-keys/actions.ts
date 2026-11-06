"use server";

import { updateTag } from "next/cache";

// updateTag (not revalidateTag) so the page re-renders with fresh data right after a
// create/edit/delete: revalidateTag's stale-while-revalidate kept showing deleted keys.
export async function revalidateApiKeysList() {
  updateTag("viewer.apiKeys.list");
}
