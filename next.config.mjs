import { fileURLToPath } from "node:url";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** CSP estrita em produção; relaxada em dev para o HMR do Next. */
const cspProduction = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.supabase.co",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.asaas.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 320, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // Raiz explícita: evita o Next inferir /home/fedora (há um package-lock.json lá fora).
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  async headers() {
    const headers = [...securityHeaders];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: cspProduction });
    }
    const assetCache = [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }];
    return [
      { source: "/(.*)", headers },
      { source: "/img/:path*", headers: assetCache },
      { source: "/:file(.+\\.(?:png|jpg|jpeg|webp|avif|svg|ico|woff2))", headers: assetCache },
    ];
  },
};

export default nextConfig;
