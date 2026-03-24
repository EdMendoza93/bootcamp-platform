import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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