import { useAtomsContext } from "@calcom/atoms/hooks/useAtomsContext";
import { AppRouterI18nContext } from "@calcom/web/app/AppRouterI18nProvider";
import { CustomI18nContext } from "@calcom/web/app/CustomI18nProvider";
import type { i18n, TFunction } from "i18next";
import { createInstance } from "i18next";
import { useContext } from "react";
import { useTranslation } from "react-i18next";

type useLocaleReturnType = {
  i18n: i18n;
  t: TFunction;
  isLocaleReady: boolean;
};

type AppRouterI18n = { translations: Record<string, string>; locale: string; ns: string };

// @internal
const serverI18nInstances = new Map<string, useLocaleReturnType>();

const getAppRouterLocale = ({ translations, locale, ns }: AppRouterI18n): useLocaleReturnType => {
  const instanceKey = `${locale}-${ns}`;
  const cached = serverI18nInstances.get(instanceKey);
  if (cached) return cached;

  const i18n = createInstance();
  // Inline resources make init synchronous, so the instance is ready on first render.
  i18n.init({
    lng: locale,
    resources: {
      [locale]: {
        [ns]: translations,
      },
    },
  });

  const appRouterLocale = { t: i18n.getFixedT(locale, ns), isLocaleReady: true, i18n };
  serverI18nInstances.set(instanceKey, appRouterLocale);
  return appRouterLocale;
};

// @internal
const useClientLocale = (
  namespace: Parameters<typeof useTranslation>[0] = "common",
  appRouterI18n?: i18n
): useLocaleReturnType => {
  const context = useAtomsContext();
  // App Router pages register no react-i18next instance. Handing ours over keeps
  // useTranslation from warning about a missing initReactI18next; its result is
  // discarded there anyway.
  const { i18n, t } = useTranslation(
    namespace,
    appRouterI18n ? { i18n: appRouterI18n, useSuspense: false } : undefined
  );
  const isLocaleReady = Object.keys(i18n).length > 0;
  if (context?.clientId) {
    return { i18n: context.i18n, t: context.t, isLocaleReady: true } as unknown as useLocaleReturnType;
  }
  return {
    i18n,
    t,
    isLocaleReady,
  };
};

export const useLocale = (): useLocaleReturnType => {
  const appRouterContext = useContext(AppRouterI18nContext);
  const customI18nContext = useContext(CustomI18nContext);
  const appRouterI18n = appRouterContext ? (customI18nContext ?? appRouterContext) : null;
  const appRouterLocale = appRouterI18n ? getAppRouterLocale(appRouterI18n) : null;
  const clientI18n = useClientLocale(appRouterI18n?.ns, appRouterLocale?.i18n);

  if (appRouterLocale) return appRouterLocale;

  console.warn(
    "useLocale hook is being used outside of App Router - hence this hook will use a global, client-side i18n which can cause a small flicker"
  );
  return {
    t: clientI18n.t,
    isLocaleReady: clientI18n.isLocaleReady,
    i18n: clientI18n.i18n,
  };
};
