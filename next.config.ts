import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination:
          "https://bootcamp-platform-27d16.firebaseapp.com/__/auth/:path*",
      },
      {
        source: "/__/firebase/:path*",
        destination:
          "https://bootcamp-platform-27d16.firebaseapp.com/__/firebase/:path*",
      },
    ];
  },
};

export default nextConfig;
