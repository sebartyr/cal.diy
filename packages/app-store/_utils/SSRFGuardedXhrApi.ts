import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { assertUrlIsSafeForSSRF } from "@calcom/lib/ssrfProtection";
import type { IXHRApi, IXHROptions, IXHRProgress } from "ews-javascript-api";

/**
 * Transport decorator for ews-javascript-api. The Exchange URL is user-controlled and used long after the
 * credential was validated (busy times are fetched from public booking pages), so every request re-validates
 * it, which re-resolves DNS. Redirects are forced off because the underlying transports (`fetch` package,
 * axios) would follow them without any check; EWS itself never asks for them outside autodiscover.
 */
export class SSRFGuardedXhrApi implements IXHRApi {
  constructor(
    private readonly inner: IXHRApi,
    private readonly logContext?: Record<string, unknown>
  ) {}

  get apiName(): string {
    return `ssrf-guarded:${this.inner.apiName ?? "unknown"}`;
  }

  async xhr(
    xhroptions: IXHROptions,
    progressDelegate?: (progressData: IXHRProgress) => void
  ): Promise<XMLHttpRequest> {
    await assertUrlIsSafeForSSRF(xhroptions.url, this.logContext);
    return this.inner.xhr({ ...xhroptions, allowRedirect: false }, progressDelegate);
  }

  /**
   * Only EWS streaming notifications use this, which Cal.diy never subscribes to. Refused rather than
   * forwarded because the default transport's stream ignores `allowRedirect` and follows redirects.
   */
  async xhrStream(
    _xhroptions: IXHROptions,
    _progressDelegate: (progressData: IXHRProgress) => void
  ): Promise<XMLHttpRequest> {
    throw new ErrorWithCode(ErrorCode.BadRequest, "EWS streaming requests are not supported");
  }

  disconnect(): void {
    this.inner.disconnect();
  }
}
