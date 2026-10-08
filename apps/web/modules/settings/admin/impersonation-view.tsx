"use client";

import { IMPERSONATION_PROVIDER_ID } from "@calcom/features/impersonation/lib/impersonationSession";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { addRecentImpersonation } from "@calcom/lib/recentImpersonations";
import { Button } from "@calcom/ui/components/button";
import { PanelCard } from "@calcom/ui/components/card";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import RecentImpersonationsList from "./components/RecentImpersonationsList";

const ImpersonationView = () => {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  // The users table links here with the target prefilled; impersonation is never started from
  // the URL alone so a crafted link cannot switch an admin's session without a click.
  const [usernameOrEmail, setUsernameOrEmail] = useState(searchParams?.get("username") ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const impersonate = async (rawIdentifier: string) => {
    const identifier = rawIdentifier.trim().toLowerCase();
    if (!identifier || isSubmitting) return;
    setIsSubmitting(true);
    const result = await signIn(IMPERSONATION_PROVIDER_ID, { username: identifier, redirect: false });
    if (!result?.ok || result.error) {
      setIsSubmitting(false);
      showToast(result?.error || t("something_went_wrong"), "error");
      return;
    }
    addRecentImpersonation(identifier);
    window.location.assign(`${WEBAPP_URL}/event-types`);
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title={t("user_impersonation_heading")} subtitle={t("impersonate_user_tip")}>
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void impersonate(usernameOrEmail);
          }}>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <TextField
              containerClassName="w-full"
              name="usernameOrEmail"
              label={t("email_or_username")}
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              autoComplete="off"
              data-testid="admin-impersonation-input"
            />
          </div>
          <p className="text-subtle text-sm">{t("impersonation_session_duration_notice")}</p>
          <div>
            <Button type="submit" loading={isSubmitting} data-testid="impersonation-submit">
              {t("impersonate")}
            </Button>
          </div>
        </form>
      </PanelCard>
      <RecentImpersonationsList onImpersonate={(username) => void impersonate(username)} />
    </div>
  );
};

export default ImpersonationView;
