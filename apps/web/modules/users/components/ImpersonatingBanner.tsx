import { IMPERSONATION_PROVIDER_ID } from "@calcom/features/impersonation/lib/impersonationSession";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { TopBanner } from "@calcom/ui/components/top-banner";
import type { SessionContextValue } from "next-auth/react";
import { signIn } from "next-auth/react";

export type ImpersonatingBannerProps = { data: SessionContextValue["data"] };

function ImpersonatingBanner({ data }: ImpersonatingBannerProps) {
  const { t } = useLocale();

  if (!data?.user.impersonatedBy) return null;
  const returnToId = data.user.impersonatedBy.id;

  return (
    <TopBanner
      text={t("impersonating_user_warning", {
        user: data.user.orgAwareUsername || data.user.username || data.user.email,
      })}
      variant="warning"
      actions={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(IMPERSONATION_PROVIDER_ID, {
              returnToId,
              callbackUrl: `${WEBAPP_URL}/settings/admin/impersonation`,
            });
          }}>
          <button
            type="submit"
            className="text-emphasis hover:underline"
            data-testid="stop-impersonating-button">
            {t("impersonating_stop_instructions")}
          </button>
        </form>
      }
    />
  );
}

export default ImpersonatingBanner;
