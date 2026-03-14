import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadFileWithTransportContract } from "@/lib/utils";

type MockProgressEvent = {
  lengthComputable: boolean;
  loaded: number;
  total: number;
};

class MockXMLHttpRequest {
  static requests: MockXMLHttpRequest[] = [];
  static responders: Array<(request: MockXMLHttpRequest) => void> = [];

  method = "";
  url = "";
  status = 0;
  responseType = "";
  response: unknown = null;
  responseText = "";
  headers = new Map<string, string>();
  body: Document | XMLHttpRequestBodyInit | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload: { onprogress: ((event: MockProgressEvent) => void) | null } = {
    onprogress: null,
  };

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
    MockXMLHttpRequest.requests.push(this);

    const responder = MockXMLHttpRequest.responders.shift();
    if (responder) {
      responder(this);
      return;
    }

    if (body instanceof File && this.upload.onprogress) {
      this.upload.onprogress({
        lengthComputable: true,
        loaded: body.size,
        total: body.size,
      });
    }

    this.status = 200;
    this.response = {};
    this.responseText = "{}";
    this.onload?.();
  }
}

const originalXmlHttpRequest = globalThis.XMLHttpRequest;

describe("upload transport contract", () => {
  beforeEach(() => {
    MockXMLHttpRequest.requests = [];
    MockXMLHttpRequest.responders = [];
    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXmlHttpRequest;
  });

  it("sends the original file directly to the signed URL and then proxies preview variants", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "family-photo.png", { type: "image/png" });
    const onProgress = vi.fn();

    await uploadFileWithTransportContract({
      target: {
        signedUrl: "https://example.com/original",
        configuredBackend: "cloudflare_r2",
        resolvedUploadBackend: "cloudflare_r2",
        rolloutState: "cloudflare_rollout_active",
        forceProxyUpload: false,
        uploadMode: "direct",
        variantUploadMode: "server_proxy",
        variantTargets: [
          {
            variant: "thumb",
            path: "trees/tree-1/media/photo/media-1/variants/thumb.webp",
            signedUrl: "https://example.com/thumb",
          },
        ],
      },
      file,
      onProgress,
    });

    expect(MockXMLHttpRequest.requests).toHaveLength(2);

    const [directRequest, variantProxyRequest] = MockXMLHttpRequest.requests;
    expect(directRequest.method).toBe("PUT");
    expect(directRequest.url).toBe("https://example.com/original");
    expect(directRequest.headers.get("Content-Type")).toBe("image/png");
    expect(directRequest.body).toBe(file);

    expect(onProgress).toHaveBeenCalledWith({
      uploadedBytes: 3,
      totalBytes: 3,
      percent: 100,
    });

    expect(variantProxyRequest.method).toBe("POST");
    expect(variantProxyRequest.url).toBe("/api/media/upload-file");
    expect(variantProxyRequest.body).toBeInstanceOf(FormData);

    const formData = variantProxyRequest.body as FormData;
    expect(formData.get("skipPrimaryUpload")).toBe("true");
    expect(formData.get("signedUrl")).toBeNull();
    expect(formData.get("contentType")).toBe("image/png");
    expect(formData.get("file")).toBe(file);
    expect(JSON.parse(String(formData.get("variantTargets")))).toEqual([
      {
        variant: "thumb",
        path: "trees/tree-1/media/photo/media-1/variants/thumb.webp",
        signedUrl: "https://example.com/thumb",
      },
    ]);
  });

  it("keeps direct upload as a single request when no server-side variants are needed", async () => {
    const file = new File([new Uint8Array([4, 5, 6, 7])], "family-video.webm", { type: "video/webm" });

    await uploadFileWithTransportContract({
      target: {
        signedUrl: "https://example.com/video-original",
        configuredBackend: "cloudflare_r2",
        resolvedUploadBackend: "cloudflare_r2",
        rolloutState: "cloudflare_rollout_active",
        forceProxyUpload: false,
        uploadMode: "direct",
        variantUploadMode: "none",
        variantTargets: [],
      },
      file,
    });

    expect(MockXMLHttpRequest.requests).toHaveLength(1);
    expect(MockXMLHttpRequest.requests[0].method).toBe("PUT");
    expect(MockXMLHttpRequest.requests[0].url).toBe("https://example.com/video-original");
    expect(MockXMLHttpRequest.requests[0].body).toBe(file);
  });

  it("falls back to proxy upload when direct browser upload fails", async () => {
    const file = new File([new Uint8Array([9, 8, 7])], "family-photo.png", { type: "image/png" });
    MockXMLHttpRequest.responders.push((request) => {
      request.onerror?.();
    });

    await uploadFileWithTransportContract({
      target: {
        signedUrl: "https://example.com/original",
        configuredBackend: "cloudflare_r2",
        resolvedUploadBackend: "cloudflare_r2",
        rolloutState: "cloudflare_rollout_active",
        forceProxyUpload: false,
        uploadMode: "direct",
        variantUploadMode: "server_proxy",
        variantTargets: [
          {
            variant: "thumb",
            path: "trees/tree-1/media/photo/media-1/variants/thumb.webp",
            signedUrl: "https://example.com/thumb",
          },
        ],
      },
      file,
    });

    expect(MockXMLHttpRequest.requests).toHaveLength(2);
    expect(MockXMLHttpRequest.requests[0].method).toBe("PUT");
    expect(MockXMLHttpRequest.requests[1].method).toBe("POST");
    expect(MockXMLHttpRequest.requests[1].url).toBe("/api/media/upload-file");

    const formData = MockXMLHttpRequest.requests[1].body as FormData;
    expect(formData.get("signedUrl")).toBe("https://example.com/original");
    expect(formData.get("skipPrimaryUpload")).toBeNull();
  });
});
