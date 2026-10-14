import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";

type AppSetupPage = {
  getServerSideProps?: (
    ctx: GetServerSidePropsContext
  ) => Promise<GetServerSidePropsResult<Record<string, unknown>>>;
};

/**
 * Apps whose setup page needs server-side props. Empty since the last ones (stripe, make,
 * alby, hitpay, btcpayserver) were removed; typed as a Record so an empty registry stays
 * valid (`keyof {}` is never) and the hook remains the extension point.
 */
export const AppSetupPageMap: Record<string, Promise<AppSetupPage>> = {};

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const { slug } = ctx.params || {};
  if (typeof slug !== "string") return { notFound: true } as const;

  const pagePromise = AppSetupPageMap[slug];
  if (!pagePromise) return { props: {} };

  const page = await pagePromise;
  if (!page.getServerSideProps) return { props: {} };

  return page.getServerSideProps(ctx);
};
