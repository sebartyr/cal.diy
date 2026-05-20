import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";

import { _generateMetadata, getTranslate } from "app/_utils";

import AdminTeamsView from "@calcom/web/modules/admin/teams/admin-teams-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("teams", { defaultValue: "Équipes" }),
    (t) => t("admin_teams_description", { defaultValue: "Toutes les équipes du système." }),
    undefined,
    undefined,
    "/settings/admin/teams"
  );

const Page = async () => {
  const t = await getTranslate();
  return (
    <SettingsHeader
      title={t("teams", { defaultValue: "Équipes" })}
      description={t("admin_teams_description", { defaultValue: "Toutes les équipes du système." })}>
      <AdminTeamsView />
    </SettingsHeader>
  );
};

export default Page;
