import type { AppMeta } from "@calcom/types/App";

export const metadata = {
  name: "Jitsi Video",
  description:
    "Jitsi is a free open-source video conferencing software for web and mobile. Make a call, launch on your own servers, integrate into your app, and more.",
  installed: true,
  type: "jitsi_video",
  variant: "conferencing",
  categories: ["conferencing"],
  logo: "icon.svg",
  publisher: "Cal.diy",
  url: "https://jitsi.org/",
  slug: "jitsi",
  title: "Jitsi Meet",
  // Global like Cal Video: Jitsi needs no API key and no per-user credential, and
  // EventManager only reaches an adapter through getApps(credentials, true), which drops
  // non-global apps that have no Credential row. Left at false, selecting jitsi as a
  // location resolved to FAKE_DAILY_CREDENTIAL and produced a Daily link instead.
  isGlobal: true,
  email: "help@cal.com",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:jitsi",
      label: "Jitsi Video",
    },
  },
  dirName: "jitsivideo",
  concurrentMeetings: true,
  isOAuth: false,
} as AppMeta;

export default metadata;
