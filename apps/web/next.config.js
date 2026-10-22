/** @type {import('next').NextConfig} */

// Headers that harden every page without breaking the Monaco editor (loaded
// from cdn.jsdelivr.net) or MediaPipe (WASM from jsdelivr, model from
// storage.googleapis.com). A full script-src CSP is documented as future work
// in docs/SECURITY.md because Monaco needs eval-like workers.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // The camera is only ever requested by this origin, after explicit consent.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com https://github.com" },
];

const nextConfig = {
  // Workspace packages are TypeScript sources.
  transpilePackages: ["@repo/core", "@repo/engine", "@repo/problem-bank", "@repo/database"],
  // BullMQ loads Lua scripts from disk and unpdf ships pdf.js; keep them out of the bundle.
  serverExternalPackages: ["bullmq", "ioredis", "unpdf", "@prisma/client"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
