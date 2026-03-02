/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  assetPrefix: '/app',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  rewrites: async () => {
    const platformUrl = process.env.PLATFORM_URL || 'http://localhost:3000';
    return [
        {
            source: '/client/campaigns',
            destination: `${platformUrl}/client/campaigns`,
        },
        {
            source: '/client',
            destination: `${platformUrl}/client`,
        }
    ];
},
}

export default nextConfig
