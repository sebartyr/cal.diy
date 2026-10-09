import dayjs from "@calcom/dayjs";
import logger from "@calcom/lib/logger";
import type { PrismaClient } from "@calcom/prisma";
import { DEFAULT_WEBHOOK_VERSION } from "./interface/IWebhookRepository";
import { createWebhookSignature, jsonParse } from "./sendPayload";

// Jobs beyond this batch stay due and are picked up by the next cron run.
const MAX_JOBS_PER_RUN = 500;

type ScheduledJob = {
  id: number;
  jobName: string | null;
  payload: string;
  subscriberUrl: string;
  webhook: { secret: string | null; version: string | null } | null;
};

async function sendScheduledJob(prisma: PrismaClient, job: ScheduledJob): Promise<void> {
  let webhook = job.webhook;

  // only needed to support old jobs that don't have the webhook relationship yet
  if (!webhook && job.jobName) {
    const [appId, subscriberId] = job.jobName.split("_");
    try {
      webhook = await prisma.webhook.findUniqueOrThrow({
        where: { id: subscriberId, appId: appId !== "null" ? appId : null },
        select: { secret: true, version: true },
      });
    } catch {
      logger.error(`Error finding webhook for subscriberId: ${subscriberId}, appId: ${appId}`);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type":
      !job.payload || jsonParse(job.payload) ? "application/json" : "application/x-www-form-urlencoded",
    "X-Cal-Webhook-Version": webhook?.version ?? DEFAULT_WEBHOOK_VERSION,
  };

  if (webhook) {
    headers["X-Cal-Signature-256"] = createWebhookSignature({ secret: webhook.secret, body: job.payload });
  }

  await fetch(job.subscriberUrl, {
    method: "POST",
    body: job.payload,
    headers,
    // Avoid following redirect
    redirect: "manual",
  }).catch((error) => {
    console.error(`Webhook trigger for subscriber url ${job.subscriberUrl} failed with error: ${error}`);
  });
}

export async function handleWebhookScheduledTriggers(prisma: PrismaClient) {
  await prisma.webhookScheduledTriggers.deleteMany({
    where: {
      startAfter: {
        lte: dayjs().subtract(1, "day").toDate(),
      },
    },
  });

  const jobsToRun: ScheduledJob[] = await prisma.webhookScheduledTriggers.findMany({
    where: {
      startAfter: {
        lte: dayjs().toDate(),
      },
    },
    orderBy: { startAfter: "asc" },
    take: MAX_JOBS_PER_RUN,
    select: {
      id: true,
      jobName: true,
      payload: true,
      subscriberUrl: true,
      webhook: {
        select: {
          secret: true,
          version: true,
        },
      },
    },
  });

  if (jobsToRun.length === 0) return;

  // Jobs are claimed by deleting them before sending (at-most-once: a failed or slow send is never
  // retried). Overlapping cron runs can read the same jobs, so only the rows this run's DELETE returned
  // are sent: PostgreSQL never returns a row from two concurrent deletes.
  const jobIds = jobsToRun.map((job) => job.id);
  const claimedRows = await prisma.$queryRaw<{ id: number }[]>`
    DELETE FROM "WebhookScheduledTriggers" WHERE "id" = ANY(${jobIds}::int[]) RETURNING "id"
  `;
  const claimedIds = new Set(claimedRows.map((row) => row.id));
  const claimedJobs = jobsToRun.filter((job) => claimedIds.has(job.id));

  // Every request goes out at once, as before, so a slow subscriber cannot delay the others. The batch is
  // awaited so the cron response is only sent once every request is done, otherwise serverless runtimes
  // may freeze the function and drop the in-flight requests.
  await Promise.allSettled(claimedJobs.map((job) => sendScheduledJob(prisma, job)));
}
