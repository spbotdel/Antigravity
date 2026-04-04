import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetLoggedMediaErrorsForTests, logMediaError } from "@/lib/utils";

const originalDebugFlag = process.env.NEXT_PUBLIC_DEBUG_MEDIA_ERRORS;

describe("media error logging helper", () => {
  beforeEach(() => {
    __resetLoggedMediaErrorsForTests();
    delete process.env.NEXT_PUBLIC_DEBUG_MEDIA_ERRORS;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    __resetLoggedMediaErrorsForTests();
    if (originalDebugFlag === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG_MEDIA_ERRORS;
      return;
    }

    process.env.NEXT_PUBLIC_DEBUG_MEDIA_ERRORS = originalDebugFlag;
  });

  it("does not log by default outside development", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logMediaError({
      mediaId: "media-1",
      type: "thumb",
      context: "test",
      src: "/api/media/media-1?variant=thumb",
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("deduplicates logs by mediaId and type when the debug flag is enabled", () => {
    process.env.NEXT_PUBLIC_DEBUG_MEDIA_ERRORS = "1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logMediaError({
      mediaId: "media-1",
      type: "thumb",
      context: "first-thumb",
      src: "/api/media/media-1?variant=thumb",
    });
    logMediaError({
      mediaId: "media-1",
      type: "thumb",
      context: "second-thumb",
      src: "/api/media/media-1?variant=thumb",
    });
    logMediaError({
      mediaId: "media-1",
      type: "original",
      context: "stage",
      src: "/api/media/media-1",
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      "[media-client]",
      expect.objectContaining({
        mediaId: "media-1",
        type: "thumb",
        context: "first-thumb",
      })
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      "[media-client]",
      expect.objectContaining({
        mediaId: "media-1",
        type: "original",
        context: "stage",
      })
    );
  });
});
