/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['mapbox-gl'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Mapbox GL uses browser-specific globals
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
