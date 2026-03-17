import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopApiPort = process.env.ELEMATE_LOCAL_API_PORT ?? process.env.FORGE_LOCAL_API_PORT ?? "43116";
const apiProxyTarget = process.env.ELEMATE_API_PROXY_TARGET ?? `http://127.0.0.1:${desktopApiPort}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  async rewrites() {
    return [
      {
        source: "/elemate-api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
      {
        source: "/forge-api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
