"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { showToast } from "@calcom/ui/components/toast";

const ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MEMBER];

export default function TeamMembersView() {
  const params = useParams();
  const { t } = useLocale();
  const teamId = Number(params?.id);

  const { data: team } = trpc.viewer.teams.get.useQuery({ teamId }, { enabled: Number.isFinite(teamId) });
  const members = trpc.viewer.teams.listMembers.useQuery(
    { teamId },
    { enabled: Number.isFinite(teamId) }
  );
  const bookingsBreakdown = trpc.viewer.teams.getActiveUserBreakdown.useQuery(
    { teamId },
    { enabled: Number.isFinite(teamId) }
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>(MembershipRole.MEMBER);

  const invite = trpc.viewer.teams.inviteMember.useMutation({
    onSuccess: () => {
      showToast(t("member_invited", { defaultValue: "Invitation envoyée" }), "success");
      setInviteOpen(false);
      setInviteEmail("");
      members.refetch();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const remove = trpc.viewer.teams.removeMember.useMutation({
    onSuccess: () => {
      showToast(t("member_removed", { defaultValue: "Membre retiré" }), "success");
      members.refetch();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const changeRole = trpc.viewer.teams.changeMemberRole.useMutation({
    onSuccess: () => {
      showToast(t("role_updated", { defaultValue: "Rôle mis à jour" }), "success");
      members.refetch();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const canAdminister = team?.myRole === "OWNER" || team?.myRole === "ADMIN";
  const isOwner = team?.myRole === "OWNER";
  const bookingsByUserId = useMemo(
    () => new Map((bookingsBreakdown.data ?? []).map((b) => [b.user.id, b.bookings])),
    [bookingsBreakdown.data]
  );

  // Render the list in chunks so a team with hundreds of members doesn't
  // build a monster DOM tree on first paint. "Load more" reveals 50 at a time.
  const PAGE = 50;
  const [shown, setShown] = useState(PAGE);
  const allMembers = members.data ?? [];
  const visible = allMembers.slice(0, shown);
  const hasMore = allMembers.length > shown;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-emphasis text-xl font-semibold">{team?.name ?? "—"}</h1>
        <nav className="border-subtle mt-2 flex gap-4 border-b text-sm">
          <a className="text-subtle px-1 py-2 hover:text-emphasis" href={`/settings/teams/${teamId}/profile`}>
            {t("profile", { defaultValue: "Profil" })}
          </a>
          <a className="border-emphasis -mb-px border-b-2 px-1 py-2" href={`/settings/teams/${teamId}/members`}>
            {t("members", { defaultValue: "Membres" })}
          </a>
        </nav>
      </header>

      <div className="flex justify-between items-center">
        <p className="text-subtle text-sm">
          {members.data?.length ?? 0} {t("members_count", { defaultValue: "membre(s)" })}
        </p>
        {canAdminister ? (
          <Button StartIcon="user-plus" onClick={() => setInviteOpen(true)}>
            {t("invite_member", { defaultValue: "Inviter" })}
          </Button>
        ) : null}
      </div>

      {members.isPending ? (
        <p className="text-subtle text-sm">{t("loading", { defaultValue: "Chargement…" })}</p>
      ) : (
        <ul className="bg-default border-subtle divide-subtle overflow-hidden rounded-md border divide-y">
          {visible.map((m) => {
            const bookingCount = bookingsByUserId.get(m.user.id) ?? 0;
            return (
              <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    size="sm"
                    alt={m.user.name ?? m.user.email}
                    imageSrc={m.user.avatarUrl ?? null}
                  />
                  <div className="min-w-0">
                    <p className="text-emphasis truncate font-medium">
                      {m.user.name ?? m.user.username ?? m.user.email}
                    </p>
                    <p className="text-subtle truncate text-xs">{m.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-subtle text-xs">
                    {bookingCount} {t("upcoming_bookings_short", { defaultValue: "rdv à venir" })}
                  </span>
                  {!m.accepted ? <Badge variant="warning">pending</Badge> : null}
                  {isOwner ? (
                    <select
                      className="border-subtle bg-default rounded-md border px-2 py-1 text-xs"
                      value={m.role}
                      onChange={(e) => {
                        const newRole = e.target.value as MembershipRole;
                        if (newRole === m.role) return;
                        const msg = t("confirm_change_role", {
                          defaultValue: `Changer le rôle de ${m.user.name ?? m.user.email} en ${newRole} ?`,
                        }) as string;
                        if (window.confirm(msg)) {
                          changeRole.mutate({ teamId, userId: m.user.id, role: newRole });
                        }
                      }}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge>{m.role}</Badge>
                  )}
                  {canAdminister ? (
                    <Button
                      size="sm"
                      color="destructive"
                      StartIcon="trash-2"
                      onClick={() => {
                        if (window.confirm(t("confirm_remove_member", { defaultValue: "Retirer ce membre ?" }) as string)) {
                          remove.mutate({ teamId, userId: m.user.id });
                        }
                      }}>
                      {t("remove", { defaultValue: "Retirer" })}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore ? (
        <div className="flex justify-center">
          <Button color="secondary" onClick={() => setShown((n) => n + PAGE)}>
            {t("load_more", { defaultValue: "Charger plus" })} ({allMembers.length - shown})
          </Button>
        </div>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader title={t("invite_member", { defaultValue: "Inviter un membre" })} />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate({ teamId, email: inviteEmail.trim(), role: inviteRole });
            }}>
            <div>
              <label className="text-emphasis mb-1 block text-sm font-medium">
                {t("email", { defaultValue: "E-mail" })}
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="border-subtle bg-default text-emphasis w-full rounded-md border px-3 py-2 text-sm"
                placeholder="user@example.com"
              />
              <p className="text-subtle mt-1 text-xs">
                {t("invite_requires_signup", {
                  defaultValue: "L'invité doit déjà avoir un compte Cal.diy.",
                })}
              </p>
            </div>
            <div>
              <label className="text-emphasis mb-1 block text-sm font-medium">
                {t("role", { defaultValue: "Rôle" })}
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MembershipRole)}
                className="border-subtle bg-default w-full rounded-md border px-3 py-2 text-sm">
                {ROLES.filter((r) => isOwner || r !== MembershipRole.OWNER).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" color="secondary" onClick={() => setInviteOpen(false)}>
                {t("cancel", { defaultValue: "Annuler" })}
              </Button>
              <Button type="submit" loading={invite.isPending}>
                {t("invite", { defaultValue: "Inviter" })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
