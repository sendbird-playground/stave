import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const srcAlias = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: srcAlias,
    },
    build: {
      rollupOptions: {
        external: ["@anthropic-ai/claude-agent-sdk", "@openai/codex-sdk"],
        input: {
          index: path.resolve(__dirname, "electron/main.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: srcAlias,
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "electron/preload.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
      watch: {
        ignored: ["**/.stave/**"],
      },
    },
    resolve: {
      alias: srcAlias,
    },
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, "index.html"),
      },
    },
  },
});
