import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/pinterest/generate-images": [
      "./node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf",
      "./node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/**",
      },
    ],
  },
};

export default nextConfig;
