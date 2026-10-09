import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import type { PageProps } from "app/_types";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

export const withAppDirSsr =
  <T extends Record<string, any>>(getServerSideProps: GetServerSideProps<T>) =>
  async (context: GetServerSidePropsContext) => {
    const ssrResponse = await getServerSideProps(context);

    if ("redirect" in ssrResponse) {
      redirect(ssrResponse.redirect.destination);
    }
    if ("notFound" in ssrResponse) {
      notFound();
    }

    const props = await Promise.resolve(ssrResponse.props);

    return {
      ...props,
    };
  };

/**
 * Same as withAppDirSsr, but the page and its generateMetadata share a single getServerSideProps
 * run per request. React.cache compares arguments by identity, so the cache key is built from
 * serialized params/searchParams, and headers/cookies are read inside the cached function
 * (they are request-scoped, like the cache itself).
 */
export const withCachedAppDirSsr = <T extends Record<string, unknown>>(
  getServerSideProps: GetServerSideProps<T>
) => {
  const getData = withAppDirSsr<T>(getServerSideProps);

  const getCachedData = cache(async (paramsKey: string, searchParamsKey: string) =>
    getData(
      buildLegacyCtx(await headers(), await cookies(), JSON.parse(paramsKey), JSON.parse(searchParamsKey))
    )
  );

  return async ({ params, searchParams }: PageProps) =>
    getCachedData(JSON.stringify(await params), JSON.stringify(await searchParams));
};
