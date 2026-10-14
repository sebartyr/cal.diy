import short from "short-uuid";
import { v5 as uuidv5 } from "uuid";

import { JitsiLocationType } from "@calcom/app-store/constants";
import { getVideoAdapters } from "@calcom/app-store/getVideoAdapters";
import { FAKE_JITSI_CREDENTIAL } from "@calcom/app-store/jitsivideo/lib/fakeCredential";
import { sendBrokenIntegrationEmail } from "@calcom/emails/integration-email-service";
import { getUid } from "@calcom/lib/CalEventParser";
import logger from "@calcom/lib/logger";
import { getPiiFreeCalendarEvent, getPiiFreeCredential } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import type { CalendarEvent, EventBusyDate } from "@calcom/types/Calendar";
import type { CredentialPayload, CredentialForCalendarService } from "@calcom/types/Credential";
import type { EventResult, PartialReference } from "@calcom/types/EventManager";
import type { VideoCallData } from "@calcom/types/VideoApiAdapter";

const log = logger.getSubLogger({ prefix: ["[features/conferencing/lib] videoClient"] });

const translator = short();

const getBusyVideoTimes = async (withCredentials: CredentialPayload[]) =>
  Promise.all((await getVideoAdapters(withCredentials)).map((c) => c?.getAvailability())).then((results) =>
    results.reduce((acc, availability) => acc.concat(availability), [] as (EventBusyDate | undefined)[])
  );

const createMeeting = async (
  credential: CredentialPayload | CredentialForCalendarService,
  calEvent: CalendarEvent
) => {
  const uid: string = getUid(calEvent.uid);
  log.debug(
    "createMeeting",
    safeStringify({
      credential: getPiiFreeCredential(credential),
      uid,
      calEvent: getPiiFreeCalendarEvent(calEvent),
    })
  );
  if (!credential || !credential.appId) {
    throw new Error(
      "Credentials must be set! Video platforms are optional, so this method shouldn't even be called when no video credentials are set."
    );
  }

  const videoAdapters = await getVideoAdapters([credential]);
  const [firstVideoAdapter] = videoAdapters;
  let createdMeeting;
  let returnObject: {
    appName: string;
    type: string;
    uid: string;
    originalEvent: CalendarEvent;
    success: boolean;
    createdEvent: VideoCallData | undefined;
    credentialId: number;
  } = {
    appName: credential.appName || credential.appId || "",
    type: credential.type,
    uid,
    originalEvent: calEvent,
    success: false,
    createdEvent: undefined,
    credentialId: credential.id,
  };
  try {
    // Check to see if video app is enabled
    const enabledApp = await prisma.app.findUnique({
      where: {
        slug: credential.appId,
      },
      select: {
        enabled: true,
      },
    });

    if (!enabledApp?.enabled)
      throw `Location app ${credential.appId} is either disabled or not seeded at all`;

    createdMeeting = await firstVideoAdapter?.createMeeting(calEvent);

    returnObject = { ...returnObject, createdEvent: createdMeeting, success: true };
    log.debug("created Meeting", safeStringify(returnObject));
  } catch (err) {
    await sendBrokenIntegrationEmail(calEvent, "video");
    log.error(
      "createMeeting failed",
      safeStringify(err),
      safeStringify({ calEvent: getPiiFreeCalendarEvent(calEvent) })
    );
    // Fall back to Jitsi, which replaced Cal Video as the default conferencing app.
    const defaultMeeting = await createMeetingWithJitsi(calEvent);
    if (defaultMeeting) {
      calEvent.location = JitsiLocationType;
    }

    returnObject = { ...returnObject, originalEvent: calEvent, createdEvent: defaultMeeting };
  }

  return returnObject;
};

const updateMeeting = async (
  credential: CredentialPayload | CredentialForCalendarService,
  calEvent: CalendarEvent,
  bookingRef: PartialReference | null
): Promise<EventResult<VideoCallData>> => {
  const uid = translator.fromUUID(uuidv5(JSON.stringify(calEvent), uuidv5.URL));
  let success = true;
  const [firstVideoAdapter] = await getVideoAdapters([credential]);
  const canCallUpdateMeeting = !!(credential && bookingRef);
  const updatedMeeting = canCallUpdateMeeting
    ? await firstVideoAdapter?.updateMeeting(bookingRef, calEvent).catch(async (e) => {
        await sendBrokenIntegrationEmail(calEvent, "video");
        log.error("updateMeeting failed", e, calEvent);
        success = false;
        return undefined;
      })
    : undefined;

  if (!updatedMeeting) {
    log.error(
      "updateMeeting failed",
      safeStringify({ bookingRef, canCallUpdateMeeting, calEvent, credential })
    );
    return {
      appName: credential.appName || credential.appId || "",
      type: credential.type,
      success,
      uid,
      originalEvent: calEvent,
    };
  }

  return {
    appName: credential.appName || credential.appId || "",
    type: credential.type,
    success,
    uid,
    updatedEvent: updatedMeeting,
    originalEvent: calEvent,
  };
};

const deleteMeeting = async (
  credential: CredentialPayload | CredentialForCalendarService | null,
  uid: string
): Promise<unknown> => {
  if (credential) {
    const videoAdapter = (await getVideoAdapters([credential]))[0];
    log.debug(
      "Calling deleteMeeting for",
      safeStringify({ credential: getPiiFreeCredential(credential), uid })
    );
    // There are certain video apps with no video adapter defined. e.g. riverby,whereby
    if (videoAdapter) {
      return videoAdapter.deleteMeeting(uid);
    }
  }

  return Promise.resolve({});
};

/**
 * Fallback when the chosen video adapter fails to create a meeting. Jitsi needs no API key
 * and reads nothing from its credential, so a synthetic one is enough. Failures are swallowed:
 * the caller already reports the original error, and a missing fallback must not mask it.
 *
 * Like the normal path, it honours App.enabled: an admin who disabled Jitsi gets no Jitsi
 * meeting, whether Jitsi itself or another provider failed.
 */
const createMeetingWithJitsi = async (calEvent: CalendarEvent) => {
  try {
    const jitsiApp = await prisma.app.findUnique({
      where: { slug: FAKE_JITSI_CREDENTIAL.appId ?? "" },
      select: { enabled: true },
    });
    if (!jitsiApp?.enabled) {
      log.warn("Jitsi fallback skipped: the jitsi app is disabled or not seeded");
      return undefined;
    }
    const [videoAdapter] = await getVideoAdapters([FAKE_JITSI_CREDENTIAL]);
    return await videoAdapter?.createMeeting(calEvent);
  } catch (error) {
    log.error("Jitsi fallback meeting creation failed", safeStringify(error));
    return undefined;
  }
};

export { getBusyVideoTimes, createMeeting, updateMeeting, deleteMeeting };
