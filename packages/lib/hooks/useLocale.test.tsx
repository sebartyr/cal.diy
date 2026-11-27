import { AppRouterI18nProvider } from "@calcom/web/app/AppRouterI18nProvider";
import { CustomI18nProvider } from "@calcom/web/app/CustomI18nProvider";
import { renderHook } from "@testing-library/react-hooks";
import type { ReactNode } from "react";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocale } from "./useLocale";

vi.mock("@calcom/atoms/hooks/useAtomsContext", () => ({
  useAtomsContext: () => null,
}));

const MISSING_INSTANCE_WARNING = "You will need to pass in an i18next instance by using initReactI18next";

const warnedWith = (spy: MockInstance<typeof console.warn>, text: string) =>
  spy.mock.calls.some((args) => args.some((arg: unknown) => typeof arg === "string" && arg.includes(text)));

describe("useLocale", () => {
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("translates from the App Router context without asking react-i18next for a global instance", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRouterI18nProvider translations={{ hello: "Bonjour" }} locale="fr-test-1" ns="common">
        {children}
      </AppRouterI18nProvider>
    );

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.t("hello")).toBe("Bonjour");
    expect(result.current.isLocaleReady).toBe(true);
    expect(warnedWith(warnSpy, MISSING_INSTANCE_WARNING)).toBe(false);
  });

  it("does not suspend when the App Router namespace is not common", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRouterI18nProvider translations={{ title: "Réservations" }} locale="fr-test-2" ns="bookings">
        {children}
      </AppRouterI18nProvider>
    );

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.t("title")).toBe("Réservations");
  });

  it("prefers the custom i18n context over the App Router one", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRouterI18nProvider translations={{ hello: "Bonjour" }} locale="fr-test-3" ns="common">
        <CustomI18nProvider translations={{ hello: "Hallo" }} locale="de-test-3" ns="common">
          {children}
        </CustomI18nProvider>
      </AppRouterI18nProvider>
    );

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.t("hello")).toBe("Hallo");
  });

  it("reuses the same instance for a locale and namespace across renders", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRouterI18nProvider translations={{ hello: "Bonjour" }} locale="fr-test-4" ns="common">
        {children}
      </AppRouterI18nProvider>
    );

    const { result, rerender } = renderHook(() => useLocale(), { wrapper });
    const first = result.current.i18n;
    rerender();

    expect(result.current.i18n).toBe(first);
  });

  it("falls back to the client-side instance outside of the App Router", () => {
    const { result } = renderHook(() => useLocale());

    expect(result.current.t("hello")).toBe("hello");
    expect(warnedWith(warnSpy, "outside of App Router")).toBe(true);
  });
});
