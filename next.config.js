/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  experimental: {
    serverActions: true,
  },
  webpack: (config) => {
    config.parallelism = 1;
    config.snapshot = config.snapshot || {};
    config.snapshot.managedPaths = [];
    config.snapshot.immutablePaths = [];
    if (config.cache) { config.cache = false; }
    return config;
  },
};
module.exports = nextConfig;
