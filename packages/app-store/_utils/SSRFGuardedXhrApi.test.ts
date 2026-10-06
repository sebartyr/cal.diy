import type { IXHRApi } from "ews-javascript-api";
import {
  ExchangeService,
  ExchangeVersion,
  FolderView,
  Uri,
  WebCredentials,
  WellKnownFolderName,
} from "ews-javascript-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: { lookup: lookupMock } }));

import { SSRFGuardedXhrApi } from "./SSRFGuardedXhrApi";

const okResponse = { status: 200 } as unknown as XMLHttpRequest;

function createInner() {
  return {
    apiName: "fake",
    xhr: vi.fn<IXHRApi["xhr"]>().mockRejectedValue(new Error("stop after transport")),
    xhrStream: vi.fn<IXHRApi["xhrStream"]>(),
    disconnect: vi.fn<IXHRApi["disconnect"]>(),
  };
}

describe("SSRFGuardedXhrApi", () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
  });

  it("forwards safe requests with redirects disabled", async () => {
    const inner = createInner();
    inner.xhr.mockResolvedValue(okResponse);
    const guarded = new SSRFGuardedXhrApi(inner);
    const progress = vi.fn();

    await guarded.xhr(
      { url: "https://mail.example.com/EWS/Exchange.asmx", type: "POST", allowRedirect: true },
      progress
    );

    expect(inner.xhr).toHaveBeenCalledWith(
      { url: "https://mail.example.com/EWS/Exchange.asmx", type: "POST", allowRedirect: false },
      progress
    );
  });

  it.each([
    ["https://169.254.169.254/latest/meta-data/", undefined],
    ["https://10.0.0.5/EWS/Exchange.asmx", undefined],
    ["https://[::ffff:a9fe:a9fe]/EWS/Exchange.asmx", undefined],
    ["https://mail.example.com/EWS/Exchange.asmx", "127.0.0.1"],
  ])("refuses %s (resolving to %s) before reaching the transport", async (url, resolvedAddress) => {
    if (resolvedAddress) lookupMock.mockResolvedValue([{ address: resolvedAddress, family: 4 }]);
    const inner = createInner();
    const guarded = new SSRFGuardedXhrApi(inner);

    await expect(guarded.xhr({ url })).rejects.toThrow("URL is not allowed");
    expect(inner.xhr).not.toHaveBeenCalled();
  });

  it("re-resolves DNS on every request", async () => {
    const inner = createInner();
    inner.xhr.mockResolvedValue(okResponse);
    const guarded = new SSRFGuardedXhrApi(inner);

    await guarded.xhr({ url: "https://mail.example.com/EWS/Exchange.asmx" });
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(guarded.xhr({ url: "https://mail.example.com/EWS/Exchange.asmx" })).rejects.toThrow(
      "URL is not allowed"
    );

    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(inner.xhr).toHaveBeenCalledTimes(1);
  });

  it("refuses streaming requests", async () => {
    const inner = createInner();
    const guarded = new SSRFGuardedXhrApi(inner);

    await expect(
      guarded.xhrStream({ url: "https://mail.example.com/EWS/Exchange.asmx" }, vi.fn())
    ).rejects.toThrow("not supported");
    expect(inner.xhrStream).not.toHaveBeenCalled();
  });

  it("delegates disconnect and exposes the inner api name", () => {
    const inner = createInner();
    const guarded = new SSRFGuardedXhrApi(inner);

    guarded.disconnect();

    expect(inner.disconnect).toHaveBeenCalled();
    expect(guarded.apiName).toBe("ssrf-guarded:fake");
  });

  describe("wired into ExchangeService", () => {
    function createService(url: string, inner: IXHRApi): ExchangeService {
      const service = new ExchangeService(ExchangeVersion.Exchange2016);
      service.Credentials = new WebCredentials("user", "password");
      service.Url = new Uri(url);
      service.XHRApi = new SSRFGuardedXhrApi(inner);
      return service;
    }

    it("routes EWS requests through the guard without allowing redirects", async () => {
      const inner = createInner();
      const service = createService("https://mail.example.com/EWS/Exchange.asmx", inner);

      await expect(
        service.FindFolders(WellKnownFolderName.MsgFolderRoot, new FolderView(10))
      ).rejects.toBeDefined();

      expect(inner.xhr).toHaveBeenCalledTimes(1);
      expect(inner.xhr.mock.calls[0][0]).toMatchObject({
        url: "https://mail.example.com/EWS/Exchange.asmx",
        allowRedirect: false,
      });
    });

    it("never sends credentials to a URL that now resolves to metadata", async () => {
      lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
      const inner = createInner();
      const service = createService("https://mail.example.com/EWS/Exchange.asmx", inner);

      await expect(
        service.FindFolders(WellKnownFolderName.MsgFolderRoot, new FolderView(10))
      ).rejects.toBeDefined();

      expect(inner.xhr).not.toHaveBeenCalled();
    });
  });
});
