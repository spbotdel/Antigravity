import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  },
  outputFileTracingIncludes: {
    "/api/media/complete": ["./node_modules/ffmpeg-static/**/*"],
    "/api/media/archive/complete": ["./node_modules/ffmpeg-static/**/*"],
    "/api/internal/media/process-video-previews": ["./node_modules/ffmpeg-static/**/*"]
  }
};

export default nextConfig;
