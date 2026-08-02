import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Splits large, rarely-changing third-party libraries into their own
    // cacheable chunks, separate from app code. Without this, Vite's
    // default single-vendor-chunk (or worse, everything-in-one-chunk)
    // behavior means every app deploy invalidates the browser cache for
    // ALL of Firebase/Recharts/etc too, even though those libraries
    // themselves didn't change — so returning users re-download megabytes
    // of unchanged library code on every single update. Splitting them out
    // means a normal app update only re-downloads the (much smaller) app
    // chunk; the vendor chunks stay cached across deploys until their own
    // dependency versions actually bump.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react";
          return "vendor";
        },
      },
    },
    // Slightly higher warning threshold since the vendor-firebase chunk is
    // legitimately large (the SDK itself) and already as split as it's
    // going to get without dropping features.
    chunkSizeWarningLimit: 700,
  },
});
