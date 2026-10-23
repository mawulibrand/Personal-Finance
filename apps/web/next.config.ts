import type { NextConfig } from 'next';
const config: NextConfig = {
  experimental: { agentUpgrade: 'security' },
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; }
};
export default config;
