import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    logLevel: "error",
    plugins: [react()],
    server: {
      proxy: {
        "/turnkey-auth-proxy": {
          target: "https://authproxy.turnkey.com",
          changeOrigin: true,
          secure: true,
          headers: {
            "X-Auth-Proxy-Config-ID": env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID ?? "",
          },
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("X-Auth-Proxy-Config-ID", env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID ?? "");
              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");
            });
          },
          rewrite: (path) => path.replace(/^\/turnkey-auth-proxy/, ""),
        },
      },
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    build: {
      chunkSizeWarningLimit: 3000,
    },
  };
});
