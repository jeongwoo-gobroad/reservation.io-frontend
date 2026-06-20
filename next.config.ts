import type { NextConfig } from "next";

const apiRewriteOrigin =
  process.env.API_REWRITE_ORIGIN ||
  (process.env.NEXT_PUBLIC_API_BASE_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : '');

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiRewriteOrigin) return [];
    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiRewriteOrigin.replace(/\/$/, '')}/:path*`,
      },
    ];
  },
};

export default nextConfig;
