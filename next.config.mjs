/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Allow Mapbox GL to be bundled
  transpilePackages: ['mapbox-gl'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Avoid mapbox-gl browser env issues
    };
    return config;
  },
};

export default nextConfig;
