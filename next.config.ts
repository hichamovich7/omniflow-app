import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  env: {
    // Inlined at build time so the shell can display the running app version.
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
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
      // Cloudflare R2 public media domain (TASK-049, R2_PUBLIC_URL).
      {
        protocol: "https",
        hostname: "media.n8nflow.org",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
