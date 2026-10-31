import { apiOrigin } from './config/api-origin.ts';
import type { NextConfig } from 'next';
import { localApiRewrites } from './config/local-api-rewrites.ts';

apiOrigin(process.env.FRAME_API_ORIGIN);
const nextConfig: NextConfig = {
  images: {
    remotePatterns: ['w500', 'w1280'].map((size) => ({
      protocol: 'https' as const,
      hostname: 'image.tmdb.org',
      port: '',
      pathname: `/t/p/${size}/*`,
      search: '',
    })),
  },
  experimental: { proxyTimeout: 3000 },
  async rewrites() {
    return {
      beforeFiles: localApiRewrites({
        FRAME_LOCAL_API_PROXY: process.env.FRAME_LOCAL_API_PROXY,
        FRAME_API_ORIGIN: process.env.FRAME_API_ORIGIN,
      }),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
