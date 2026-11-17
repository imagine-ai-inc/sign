import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic rendering (no Cache Components): every page here is per-user and auth-gated.
  // pdf-lib MUST be external: @signpdf/placeholder-pdf-lib is external and requires its own pdf-lib from
  // node_modules. If pdf-lib is also bundled, two copies exist, the /ByteRange placeholder written by the
  // external copy is invisible to the bundled one, and sealPdf throws "No ByteRangeStrings found within PDF buffer".
  serverExternalPackages: ["@react-email/render", "pdfjs-dist", "pdf-lib", "@signpdf/signpdf", "@signpdf/signer-p12", "@signpdf/placeholder-pdf-lib", "node-forge"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default nextConfig;
