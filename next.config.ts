import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist loads its worker from its own package directory at runtime, so it
  // must not be bundled.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
