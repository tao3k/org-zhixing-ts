import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const orgizePackageRoot = resolve(projectRoot, "node_modules/orgize");
const publicRoot = resolve(projectRoot, "public");
const staticManifestPath = resolve(projectRoot, ".cache/org-zhixing/static-site.json");
const staticSourceShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.sources");
const staticMemoryShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.memory");
const staticSectionShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.sections");
const staticAttachmentShardRoot = resolve(
  projectRoot,
  ".cache/org-zhixing/org-zhixing.attachments",
);
const staticAgendaShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.agenda");
const orgizePackageWatchFiles = existsSync(orgizePackageRoot)
  ? [
      resolve(orgizePackageRoot, "worker.js"),
      resolve(orgizePackageRoot, "dto.js"),
      resolve(orgizePackageRoot, "package.json"),
      resolve(orgizePackageRoot, "dist/**/*"),
    ]
  : [];

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      app: resolve(projectRoot, "src/main.tsx"),
    },
  },
  html: {
    template: resolve(projectRoot, "index.html"),
    scriptLoading: "module",
  },
  output: {
    assetPrefix: "auto",
    cleanDistPath: true,
    distPath: {
      root: "dist",
      js: "assets",
      jsAsync: "assets",
      css: "assets",
      cssAsync: "assets",
      wasm: "assets",
      assets: "assets",
    },
    filename: {
      html: "index.html",
      js: "[name].[contenthash:8].js",
      css: "[name].[contenthash:8].css",
      wasm: "[name].[contenthash:8][ext]",
      assets: "[name].[contenthash:8][ext]",
    },
    copy: [
      ...(existsSync(staticManifestPath)
        ? [{ from: staticManifestPath, to: "org-zhixing.static.json" }]
        : []),
      ...(existsSync(staticSourceShardRoot)
        ? [
            {
              from: resolve(staticSourceShardRoot, "*.json"),
              to: "org-zhixing.sources/[name][ext]",
            },
          ]
        : []),
      ...(existsSync(staticMemoryShardRoot)
        ? [{ from: resolve(staticMemoryShardRoot, "*.json"), to: "org-zhixing.memory/[name][ext]" }]
        : []),
      ...(existsSync(staticSectionShardRoot)
        ? [
            {
              from: resolve(staticSectionShardRoot, "*.json"),
              to: "org-zhixing.sections/[name][ext]",
            },
          ]
        : []),
      ...(existsSync(staticAttachmentShardRoot)
        ? [
            {
              from: resolve(staticAttachmentShardRoot, "*.json"),
              to: "org-zhixing.attachments/[name][ext]",
            },
          ]
        : []),
      ...(existsSync(staticAgendaShardRoot)
        ? [{ from: resolve(staticAgendaShardRoot, "*.json"), to: "org-zhixing.agenda/[name][ext]" }]
        : []),
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    historyApiFallback: true,
    publicDir: {
      name: publicRoot,
      copyOnBuild: true,
      watch: true,
    },
  },
  dev: {
    assetPrefix: "auto",
    hmr: true,
    liveReload: true,
    progressBar: true,
    watchFiles: [
      {
        paths: [
          resolve(publicRoot, "**/*.{org,toml}"),
          resolve(projectRoot, "index.html"),
          ...orgizePackageWatchFiles,
        ],
        type: "reload-page",
      },
    ],
  },
  splitChunks: {
    chunks: "all",
  },
});
