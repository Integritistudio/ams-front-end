const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Prevent Next.js from using C:\Users\SajidMasood\package-lock.json as the workspace root
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
