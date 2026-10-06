import process from "node:process";
import { symmetricEncrypt } from "@calcom/lib/crypto";
import { emailSchema } from "@calcom/lib/emailSchema";
import logger from "@calcom/lib/logger";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { assertUrlIsSafeForSSRF } from "@calcom/lib/ssrfProtection";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import checkSession from "../../_utils/auth";
import { ExchangeAuthentication, ExchangeVersion } from "../enums";
import { BuildCalendarService } from "../lib";

const formSchema = z
  .object({
    url: z.string().url(),
    username: emailSchema,
    password: z.string(),
    authenticationMethod: z.number().default(ExchangeAuthentication.STANDARD),
    exchangeVersion: z.number().default(ExchangeVersion.Exchange2016),
    useCompression: z.boolean().default(false),
  })
  .strict();

export async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const session = checkSession(req);
  const body = formSchema.parse(req.body);
  const encrypted = symmetricEncrypt(JSON.stringify(body), process.env.CALENDSO_ENCRYPTION_KEY || "");
  const data = {
    type: "exchange_calendar",
    key: encrypted,
    userId: session.user?.id,
    teamId: null,
    appId: "exchange",
    invalid: false,
    delegationCredentialId: null,
  };

  try {
    await assertUrlIsSafeForSSRF(body.url, { appId: data.appId, userId: data.userId });
    const service = BuildCalendarService({
      id: 0,
      user: { email: session.user.email || "" },
      ...data,
      encryptedKey: null,
    });
    await service?.listCalendars();
    await prisma.credential.create({ data });
  } catch (reason) {
    // SOAP fault messages can echo responses from arbitrary hosts, so never return them to the client
    logger.info(reason);
    return res.status(500).json({ message: "Could not add this exchange account" });
  }

  return res.status(200).json({ url: "/apps/installed" });
}

export default defaultResponder(getHandler);
