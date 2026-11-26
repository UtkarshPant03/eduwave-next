import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Limits where scripts, styles, images and connections may
 * come from, so injected markup can't load attacker code or exfiltrate data.
 *
 * Trade-off (worth discussing in class): Next.js inlines small bootstrap scripts, so
 * script-src needs 'unsafe-inline' unless every page uses per-request nonces, which
 * would disable static prerendering. React's automatic escaping remains the primary
 * XSS defence; the CSP still blocks third-party scripts, plugins, framing and form hijacking.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Clickjacking: nobody may embed eduWave in a frame (CSP frame-ancestors covers modern browsers).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera/mic are used by Jitsi in its own tab, not by this site.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // PGlite ships a WASM Postgres build; let Node load it directly instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Resource uploads are capped at 8 MB in lib/uploads.ts; leave room for multipart overhead.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
