import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rspack from "@rspack/core";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const orgizePackageRoot = resolve(projectRoot, "node_modules/orgize");
const publicRoot = resolve(projectRoot, "public");
const staticManifestPath = resolve(projectRoot, ".cache/org-zhixing/static-site.json");
const staticSourceShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.sources");
const staticMemoryShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.memory");
const staticSectionShardRoot = resolve(projectRoot, ".cache/org-zhixing/org-zhixing.sections");
const orgizePackageWatchFiles = existsSync(orgizePackageRoot)
  ? [
      resolve(orgizePackageRoot, "worker.js"),
      resolve(orgizePackageRoot, "dto.js"),
      resolve(orgizePackageRoot, "package.json"),
      resolve(orgizePackageRoot, "dist/**/*"),
    ]
  : [];

export default (_env, argv) => {
  const mode = argv.mode === "production" ? "production" : "development";
  const isProduction = mode === "production";

  return {
    context: projectRoot,
    mode,
    devtool: isProduction ? "source-map" : "eval-cheap-module-source-map",
    entry: {
      app: [resolve(projectRoot, "src/styles.css"), resolve(projectRoot, "src/main.ts")],
    },
    output: {
      path: resolve(projectRoot, "dist"),
      filename: "assets/[name].[contenthash:8].js",
      chunkFilename: "assets/[name].[contenthash:8].js",
      assetModuleFilename: "assets/[name].[contenthash:8][ext]",
      publicPath: "auto",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/i,
          exclude: /node_modules/,
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: {
                syntax: "typescript",
              },
              target: "es2022",
            },
          },
          type: "javascript/auto",
        },
        {
          test: /\.css$/i,
          type: "css/auto",
        },
        {
          test: /\.wasm$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: resolve(projectRoot, "index.html"),
        scriptLoading: "module",
        minify: isProduction,
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: publicRoot, to: "." },
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
            ? [
                {
                  from: resolve(staticMemoryShardRoot, "*.json"),
                  to: "org-zhixing.memory/[name][ext]",
                },
              ]
            : []),
          ...(existsSync(staticSectionShardRoot)
            ? [
                {
                  from: resolve(staticSectionShardRoot, "*.json"),
                  to: "org-zhixing.sections/[name][ext]",
                },
              ]
            : []),
        ],
      }),
    ],
    optimization: {
      runtimeChunk: "single",
      splitChunks: {
        chunks: "all",
      },
    },
    devServer: {
      host: "127.0.0.1",
      port: 5173,
      hot: !isProduction,
      liveReload: true,
      historyApiFallback: true,
      static: {
        directory: publicRoot,
        publicPath: "/",
        watch: true,
      },
      watchFiles: [resolve(publicRoot, "**/*.{org,toml}"), ...orgizePackageWatchFiles],
      client: {
        overlay: true,
        progress: true,
      },
    },
  };
};
