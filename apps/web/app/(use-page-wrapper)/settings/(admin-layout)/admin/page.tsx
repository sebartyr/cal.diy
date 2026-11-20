import { _generateMetadata } from "app/_utils";
import { requireSystemAdmin } from "../requireSystemAdmin";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("admin"),
    () => "",
    undefined,
    undefined,
    "/settings/admin"
  );

const Page = async () => {
  await requireSystemAdmin();
  return <h1>Admin index</h1>;
};
export default Page;
