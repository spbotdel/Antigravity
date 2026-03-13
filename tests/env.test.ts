import { afterEach, describe, expect, it } from "vitest";

import { getObjectStorageEnvForMedia, getObjectStorageEnvForNewMedia, resolveMediaUploadPlan, resolveMediaUploadTransport, shouldForceProxyMediaUpload, shouldUseCloudflareR2ForMedia, shouldUseCloudflareR2ForNewMedia } from "@/lib/env";
import { formatMediaUploadTransportHint } from "@/lib/utils";

const ENV_KEYS = [
  "MEDIA_STORAGE_BACKEND",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "CF_ACCOUNT_ID",
  "CF_R2_BUCKET",
  "CF_R2_ACCESS_KEY_ID",
  "CF_R2_SECRET_ACCESS_KEY",
  "CF_R2_ENDPOINT",
  "CF_R2_REGION",
  "CF_R2_ROLLOUT_AT",
  "MEDIA_UPLOAD_FORCE_PROXY",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function seedStorageEnv() {
  process.env.OBJECT_STORAGE_BUCKET = "legacy-bucket";
  process.env.OBJECT_STORAGE_ENDPOINT = "https://storage.yandexcloud.net";
  process.env.OBJECT_STORAGE_REGION = "ru-central1";
  process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "legacy-key";
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "legacy-secret";

  process.env.CF_ACCOUNT_ID = "cf-account";
  process.env.CF_R2_BUCKET = "r2-bucket";
  process.env.CF_R2_ACCESS_KEY_ID = "r2-key";
  process.env.CF_R2_SECRET_ACCESS_KEY = "r2-secret";
  process.env.CF_R2_ENDPOINT = "https://cf-account.r2.cloudflarestorage.com";
  process.env.CF_R2_REGION = "auto";
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("media env rollout gating", () => {
  it("keeps new uploads on the legacy object-storage path before rollout time", () => {
    seedStorageEnv();
    process.env.MEDIA_STORAGE_BACKEND = "cloudflare_r2";
    process.env.CF_R2_ROLLOUT_AT = "2099-01-01T00:00:00Z";

    expect(shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z"))).toBe(false);
    expect(getObjectStorageEnvForNewMedia(Date.parse("2026-03-09T00:00:00Z")).bucket).toBe("legacy-bucket");
    expect(
      resolveMediaUploadPlan({
        useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z")),
        hasVariants: true,
      })
    ).toMatchObject({
      configuredBackend: "cloudflare_r2",
      resolvedUploadBackend: "object_storage",
      rolloutState: "cloudflare_rollout_gated",
      forceProxyUpload: false,
      uploadMode: "proxy",
      variantUploadMode: "server_proxy",
    });
  });

  it("switches new uploads and fresh reads to Cloudflare after rollout time", () => {
    seedStorageEnv();
    process.env.MEDIA_STORAGE_BACKEND = "cloudflare_r2";
    process.env.CF_R2_ROLLOUT_AT = "2026-03-01T00:00:00Z";

    expect(shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z"))).toBe(true);
    expect(getObjectStorageEnvForNewMedia(Date.parse("2026-03-09T00:00:00Z")).bucket).toBe("r2-bucket");
    expect(shouldUseCloudflareR2ForMedia("2026-03-09T00:00:00Z")).toBe(true);
    expect(getObjectStorageEnvForMedia("2026-03-09T00:00:00Z").bucket).toBe("r2-bucket");
    expect(getObjectStorageEnvForMedia("2026-02-20T00:00:00Z").bucket).toBe("legacy-bucket");
    expect(
      resolveMediaUploadPlan({
        useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z")),
        hasVariants: true,
      })
    ).toMatchObject({
      configuredBackend: "cloudflare_r2",
      resolvedUploadBackend: "cloudflare_r2",
      rolloutState: "cloudflare_rollout_active",
      forceProxyUpload: false,
      uploadMode: "direct",
      variantUploadMode: "server_proxy",
    });
  });

  it("does not activate Cloudflare rollout when the timestamp is invalid", () => {
    seedStorageEnv();
    process.env.MEDIA_STORAGE_BACKEND = "cloudflare_r2";
    process.env.CF_R2_ROLLOUT_AT = "not-a-date";

    expect(shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z"))).toBe(false);
    expect(shouldUseCloudflareR2ForMedia("2026-03-09T00:00:00Z")).toBe(false);
    expect(getObjectStorageEnvForNewMedia(Date.parse("2026-03-09T00:00:00Z")).bucket).toBe("legacy-bucket");
  });

  it("resolves upload transport semantics from backend, rollout gate, and variant presence", () => {
    seedStorageEnv();
    process.env.MEDIA_STORAGE_BACKEND = "cloudflare_r2";
    process.env.CF_R2_ROLLOUT_AT = "2026-03-01T00:00:00Z";

    expect(
      resolveMediaUploadTransport({
        useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z")),
        hasVariants: true,
      })
    ).toEqual({
      uploadMode: "direct",
      variantUploadMode: "server_proxy",
    });

    expect(
      resolveMediaUploadTransport({
        useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z")),
        hasVariants: false,
      })
    ).toEqual({
      uploadMode: "direct",
      variantUploadMode: "none",
    });

    expect(
      resolveMediaUploadTransport({
        backend: "object_storage",
        useCloudflareForNewMedia: false,
        hasVariants: true,
      })
    ).toEqual({
      uploadMode: "proxy",
      variantUploadMode: "server_proxy",
    });
  });

  it("forces proxy uploads when MEDIA_UPLOAD_FORCE_PROXY is enabled", () => {
    seedStorageEnv();
    process.env.MEDIA_STORAGE_BACKEND = "cloudflare_r2";
    process.env.CF_R2_ROLLOUT_AT = "2026-03-01T00:00:00Z";
    process.env.MEDIA_UPLOAD_FORCE_PROXY = "true";

    expect(shouldForceProxyMediaUpload()).toBe(true);
    expect(
      resolveMediaUploadTransport({
        useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z")),
        hasVariants: true,
      })
    ).toEqual({
      uploadMode: "proxy",
      variantUploadMode: "server_proxy",
    });
    expect(
      resolveMediaUploadPlan({
        useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(Date.parse("2026-03-09T00:00:00Z")),
        hasVariants: true,
      })
    ).toMatchObject({
      configuredBackend: "cloudflare_r2",
      resolvedUploadBackend: "cloudflare_r2",
      rolloutState: "cloudflare_rollout_active",
      forceProxyUpload: true,
      uploadMode: "proxy",
      variantUploadMode: "server_proxy",
    });
  });
});

describe("media upload transport hint", () => {
  it("describes the gated Cloudflare rollout path", () => {
    expect(
      formatMediaUploadTransportHint({
        signedUrl: "https://example.com/upload",
        configuredBackend: "cloudflare_r2",
        resolvedUploadBackend: "object_storage",
        rolloutState: "cloudflare_rollout_gated",
        forceProxyUpload: false,
        uploadMode: "proxy",
        variantUploadMode: "server_proxy",
      })
    ).toContain("rollout еще не активен");
  });

  it("describes the active direct Cloudflare path with server-side variants", () => {
    expect(
      formatMediaUploadTransportHint({
        signedUrl: "https://example.com/upload",
        configuredBackend: "cloudflare_r2",
        resolvedUploadBackend: "cloudflare_r2",
        rolloutState: "cloudflare_rollout_active",
        forceProxyUpload: false,
        uploadMode: "direct",
        variantUploadMode: "server_proxy",
        variantTargets: [{ variant: "thumb", path: "thumb.webp", signedUrl: "https://example.com/thumb" }],
      })
    ).toContain("preview-варианты");
  });

  it("stays silent for non-Cloudflare uploads", () => {
    expect(
      formatMediaUploadTransportHint({
        signedUrl: "https://example.com/upload",
        configuredBackend: "object_storage",
        resolvedUploadBackend: "object_storage",
        rolloutState: "steady_state",
        forceProxyUpload: false,
        uploadMode: "proxy",
        variantUploadMode: "server_proxy",
      })
    ).toBeNull();
  });

  it("describes an explicit proxy override when Cloudflare rollout is active", () => {
    expect(
      formatMediaUploadTransportHint({
        signedUrl: "https://example.com/upload",
        configuredBackend: "cloudflare_r2",
        resolvedUploadBackend: "cloudflare_r2",
        rolloutState: "cloudflare_rollout_active",
        forceProxyUpload: true,
        uploadMode: "proxy",
        variantUploadMode: "server_proxy",
      })
    ).toContain("принудительно");
  });
});
