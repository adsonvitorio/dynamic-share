import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const serverTarget = process.env.SHARE_SERVER_URL ?? "http://localhost:8080";
const livekitTarget = process.env.SHARE_LIVEKIT_URL ?? "ws://localhost:7880";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true,
    proxy: {
      "/api": { target: serverTarget, changeOrigin: false },
      "/webhook": { target: serverTarget, changeOrigin: false },
      "/rtc": { target: livekitTarget, ws: true },
    },
  },
  esbuild: {
    drop: ["debugger"],
    pure: ["console.log", "console.debug"],
  },
});
