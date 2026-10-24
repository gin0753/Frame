import type { NextConfig } from 'next';
import { localApiRewrites } from './config/local-api-rewrites';

const nextConfig: NextConfig = {
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
