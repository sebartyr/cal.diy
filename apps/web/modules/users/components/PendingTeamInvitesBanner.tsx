import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { TopBanner } from "@calcom/ui/components/top-banner";
import Link from "next/link";

export type PendingTeamInvitesBannerProps = {
  data: RouterOutputs["viewer"]["me"]["getUserTopBanners"]["pendingTeamInvitesBanner"];
};

function PendingTeamInvitesBanner({ data }: PendingTeamInvitesBannerProps) {
  const { t } = useLocale();

  if (!data) return null;

  return (
    <TopBanner
      icon="users"
      text={t("pending_team_invites_banner", { count: data })}
      actions={
        <Link href="/settings/teams" className="border-b border-b-black">
          {t("view_team_invites")}
        </Link>
      }
    />
  );
}

export default PendingTeamInvitesBanner;
