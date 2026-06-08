import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow LAN devices (Android TV, phones) to access the dev server
  // Covers the full 192.168.0.x and 192.168.1.x subnets common on home/office WiFi
  allowedDevOrigins: [
    "192.168.0.*",
    "192.168.1.*",
    "10.0.0.*",
    "10.0.1.*",
  ],
};

export default nextConfig;
