import type { GetServerSidePropsContext } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCachedAppDirSsr } from "./WithAppDirSsr";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "cal.example", "x-test": "1" })),
  cookies: vi.fn(async () => ({ getAll: () => [{ name: "session", value: "abc" }] })),
}));

// React's request-scoped cache() only memoizes inside an RSC render, so the test stands in a
// cache shared across calls, which is what a single request sees.
const cacheStore = new Map<string, unknown>();
vi.mock("react", () => ({
  cache:
    <Args extends string[], R>(fn: (...args: Args) => R) =>
    (...args: Args): R => {
      const key = JSON.stringify(args);
      if (!cacheStore.has(key)) cacheStore.set(key, fn(...args));
      return cacheStore.get(key) as R;
    },
}));

const pageProps = (params: Record<string, string>, searchParams: Record<string, string | string[]> = {}) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve(searchParams),
});

describe("withCachedAppDirSsr", () => {
  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it("runs getServerSideProps once when the page and generateMetadata load the same route", async () => {
    const gssp = vi.fn(async () => ({ props: { title: "30min" } }));
    const getData = withCachedAppDirSsr(gssp);

    const [metadataProps, pageData] = await Promise.all([
      getData(pageProps({ user: "pro", type: "30min" }, { month: "2026-10" })),
      getData(pageProps({ user: "pro", type: "30min" }, { month: "2026-10" })),
    ]);

    expect(gssp).toHaveBeenCalledTimes(1);
    expect(metadataProps).toEqual({ title: "30min" });
    expect(pageData).toEqual({ title: "30min" });
  });

  it("runs getServerSideProps again for different params or searchParams", async () => {
    const gssp = vi.fn(async () => ({ props: {} }));
    const getData = withCachedAppDirSsr(gssp);

    await getData(pageProps({ user: "pro", type: "30min" }));
    await getData(pageProps({ user: "pro", type: "60min" }));
    await getData(pageProps({ user: "pro", type: "60min" }, { rescheduleUid: "uid" }));

    expect(gssp).toHaveBeenCalledTimes(3);
  });

  it("builds the same legacy context as before, with decoded params and request headers and cookies", async () => {
    const gssp = vi.fn(async (_ctx: GetServerSidePropsContext) => ({ props: {} }));
    const getData = withCachedAppDirSsr(gssp);

    await getData(
      pageProps({ user: "John%20Doe", type: "30min" }, { layout: "week_view", slot: ["a", "b"] })
    );

    expect(headers).toHaveBeenCalledTimes(1);
    expect(cookies).toHaveBeenCalledTimes(1);
    const ctx = gssp.mock.calls[0][0];
    expect(ctx.params).toEqual({ user: "John Doe", type: "30min" });
    expect(ctx.query).toEqual({ layout: "week_view", slot: ["a", "b"], user: "John Doe", type: "30min" });
    expect(ctx.req.headers).toEqual({ host: "cal.example", "x-test": "1" });
    expect(ctx.req.cookies).toEqual({ session: "abc" });
  });

  it("still redirects from both callers when getServerSideProps returns a redirect", async () => {
    const gssp = vi.fn(async () => ({ redirect: { destination: "/elsewhere", permanent: false } }));
    const getData = withCachedAppDirSsr(gssp);

    await expect(getData(pageProps({ user: "pro" }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(getData(pageProps({ user: "pro" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/elsewhere");
    expect(gssp).toHaveBeenCalledTimes(1);
  });

  it("still calls notFound when getServerSideProps returns notFound", async () => {
    const gssp = vi.fn(async () => ({ notFound: true as const }));
    const getData = withCachedAppDirSsr(gssp);

    await expect(getData(pageProps({ user: "missing" }))).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
