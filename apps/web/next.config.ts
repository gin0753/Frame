import { apiOrigin } from './config/api-origin.ts';
import type { NextConfig } from 'next';
import { localApiRewrites } from './config/local-api-rewrites.ts';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

apiOrigin(process.env.FRAME_API_ORIGIN);
const nextConfig: NextConfig = {
  images: {
    remotePatterns: ['w185', 'w500', 'w1280'].map((size) => ({
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

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Prototype entries are not routes (or bundle entry points) in production.
    pageExtensions: [
      'tsx',
      'ts',
      'jsx',
      'js',
      ...(phase === PHASE_DEVELOPMENT_SERVER ? ['dev.tsx'] : []),
    ],
  };
}
