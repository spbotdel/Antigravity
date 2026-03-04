import { describe, expect, it } from "vitest";

import { videoSchema } from "@/lib/validators/media";
import { createTreeSchema } from "@/lib/validators/tree";

describe("validators", () => {
  it("accepts valid tree creation payloads", () => {
    const parsed = createTreeSchema.parse({
      title: "My Family",
      slug: "my-family",
      description: "desc"
    });

    expect(parsed.slug).toBe("my-family");
  });

  it("rejects non-yandex video links", () => {
    const result = videoSchema.safeParse({
      treeId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      title: "Video",
      caption: "",
      externalUrl: "https://example.com/video"
    });

    expect(result.success).toBe(false);
  });
});
