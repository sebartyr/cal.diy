import { getServerSideProps, type PageProps } from "@lib/d/[link]/[slug]/getServerSideProps";
import type { PageProps as _PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { withCachedAppDirSsr } from "app/WithAppDirSsr";
import Type from "~/d/[link]/d-type-view";

export const generateMetadata = async ({ params, searchParams }: _PageProps) => {
  const _params = await params;
  const pageProps = await getData({ params, searchParams });

  const { booking, eventData, isBrandingHidden } = pageProps;
  const rescheduleUid = booking?.uid;

  const profileName = eventData?.profile?.name ?? "";
  const title = eventData?.title ?? "";
  return await _generateMetadata(
    (t) => `${rescheduleUid && !!booking ? t("reschedule") : ""} ${title} | ${profileName}`,
    (t) => `${rescheduleUid ? t("reschedule") : ""} ${title}`,
    isBrandingHidden,
    undefined,
    `/d/${_params.link}/${_params.slug}`
  );
};

const getData = withCachedAppDirSsr<PageProps>(getServerSideProps);
const ServerPage = async ({ params, searchParams }: _PageProps) => {
  const pageProps = await getData({ params, searchParams });

  return <Type {...pageProps} />;
};

export default ServerPage;
