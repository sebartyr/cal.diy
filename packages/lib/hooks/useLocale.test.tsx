import { AppRouterI18nProvider } from "@calcom/web/app/AppRouterI18nProvider";
import { CustomI18nProvider } from "@calcom/web/app/CustomI18nProvider";
import { renderHook } from "@testing-library/react-hooks";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocale } from "./useLocale";

// react-i18next warns about a missing instance only once per module, so a
// silent console proves nothing; spy on the call it receives instead.
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return { ...actual, useTranslation: vi.fn(actual.useTranslation) };
});

vi.mock("@calcom/atoms/hooks/useAtomsContext", () => ({
  useAtomsContext: () => null,
}));

const warnedWith = (spy: MockInstance<typeof console.warn>, text: string) =>
  spy.mock.calls.some((args) => args.some((arg: unknown) => typeof arg === "string" && arg.includes(text)));

describe("useLocale", () => {
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.mocked(useTranslation).mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("hands the App Router instance to useTranslation instead of the global one", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRouterI18nProvider translations={{ hello: "Bonjour" }} locale="fr-test-1" ns="common">
        {children}
      </AppRouterI18nProvider>
    );

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.t("hello")).toBe("Bonjour");
    expect(result.current.isLocaleReady).toBe(true);
    expect(useTranslation).toHaveBeenCalledWith(
      "common",
      expect.objectContaining({ i18n: result.current.i18n, useSuspense: false })
    );
  });

  it("does not suspend when the App Router namespace is not common", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRouterI18nProvider translations={{ title: "Réservations" }} locale="fr-test-2" ns="bookings">
        {children}
      </AppRouterI18nProvider>
    );

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.t("title")).toBe("Réservations");
    expect(useTranslation).toHaveBeenCalledWith("bookings", expect.objectContaining({ useSuspense: false }));
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
