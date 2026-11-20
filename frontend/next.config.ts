import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate dev lock/cache lets browser tests coexist with npm run dev.
  distDir: process.env.KANBAN_UI_TEST === "1" ? ".next/ui-tests" : ".next",
};

export default nextConfig;
