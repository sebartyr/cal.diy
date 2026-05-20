import type { NextApiRequest, NextApiResponse } from "next";

import { symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import { logBlockedSSRFAttempt, validateUrlForSSRF } from "@calcom/lib/ssrfProtection";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import appConfig from "../config.json";
import { BuildCalendarService } from "../lib";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { urls } = req.body;

    // SEC-104: each ICS feed URL is fetched server-side by the underlying
    // dav library. Validate every entry the same way as webhook URLs so an
    // attacker can't register e.g. http://169.254.169.254/... as a "feed".
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ message: "At least one ICS feed URL is required" });
    }
    for (const candidate of urls) {
      if (typeof candidate !== "string" || !candidate) {
        return res.status(400).json({ message: "ICS feed URLs must be non-empty strings" });
      }
      const check = await validateUrlForSSRF(candidate);
      if (!check.isValid) {
        logBlockedSSRFAttempt(candidate, check.error ?? "unknown", { where: "ics-feed.add" });
        return res.status(400).json({ message: "Refused ICS feed URL — server-side fetch protection" });
      }
    }
    // Get user
    const user = await prisma.user.findFirstOrThrow({
      where: {
        id: req.session?.user?.id,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const data = {
      type: appConfig.type,
      key: symmetricEncrypt(JSON.stringify({ urls }), process.env.CALENDSO_ENCRYPTION_KEY || ""),
      userId: user.id,
      teamId: null,
      appId: appConfig.slug,
      invalid: false,
      delegationCredentialId: null,
    };

    try {
      const dav = BuildCalendarService({
        id: 0,
        ...data,
        user: { email: user.email },
        encryptedKey: null,
      });
      const listedCals = await dav.listCalendars();

      if (listedCals.length !== urls.length) {
        throw new Error(`Listed cals and URLs mismatch: ${listedCals.length} vs. ${urls.length}`);
      }

      await prisma.credential.create({
        data,
      });
    } catch (e) {
      logger.error("Could not add ICS feeds", e);
      return res.status(500).json({ message: "Could not add ICS feeds" });
    }

    return res.status(200).json({ url: getInstalledAppPath({ variant: "calendar", slug: "ics-feed" }) });
  }

  if (req.method === "GET") {
    return res.status(200).json({ url: "/apps/ics-feed/setup" });
  }
}
