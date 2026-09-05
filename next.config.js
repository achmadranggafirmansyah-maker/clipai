/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // durasi proses render bisa lama (video panjang) -> naikkan batas waktu function
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg'],
  },
};

module.exports = nextConfig;
