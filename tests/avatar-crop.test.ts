import { describe, expect, it } from "vitest";

import { applyAvatarCropDrag, buildAvatarSvgImageAttrs, normalizeAvatarCrop, resolveAvatarCropLayout } from "@/lib/avatar-crop";

describe("avatar crop helper", () => {
  it("normalizes crop values into the shared bounds", () => {
    expect(
      normalizeAvatarCrop({
        x: -10,
        y: 10,
        zoom: 99
      })
    ).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      zoom: 3
    });
  });

  it("uses one square layout model for renderers", () => {
    const layout = resolveAvatarCropLayout({ x: 0.5, y: 0.5, zoom: 2 });
    const svg = buildAvatarSvgImageAttrs({ x: 0.5, y: 0.5, zoom: 2 });

    expect(layout.imageSize).toBe(2);
    expect(layout.imageX).toBe(-0.5);
    expect(layout.imageY).toBe(-0.5);
    expect(svg).toEqual({
      x: -0.5,
      y: -0.5,
      width: 2,
      height: 2
    });
  });

  it("updates crop center from drag using the same zoom-aware math", () => {
    expect(applyAvatarCropDrag({ x: 0.5, y: 0.5, zoom: 2 }, 40, -20, 200)).toEqual({
      x: 0.4,
      y: 0.55,
      zoom: 2
    });
  });
});
