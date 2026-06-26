import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";
import { execSync } from "node:child_process";

// Some plugins use require() internally
globalThis.require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildClient() {
  console.log("📦  Building client (Vite)...");
  execSync("npx vite build --config vite.config.ts", {
    cwd: __dirname,
    stdio: "inherit",
  });
  console.log("✅  Client build complete\n");
}

async function buildServer() {
  console.log("🔧  Building server (esbuild)...");
  const distDir = path.resolve(__dirname, "dist/server");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(__dirname, "server/main.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",

    // Map workspace packages to their inlined source paths
    alias: {
      "@workspace/db": path.resolve(__dirname, "shared/db/index.ts"),
      "@workspace/api-zod": path.resolve(__dirname, "shared/schemas/index.ts"),
    },

    // Only externalize true native modules that can't be bundled
    external: [
      "*.node",
      "pg-native",
      "fsevents",
      "bufferutil",
      "utf-8-validate",
    ],

    sourcemap: "linked",

    // pino uses worker threads for transports; this plugin bundles them properly
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],

    // CJS-only packages (e.g. express) need this shim to work inside an ESM bundle
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });

  console.log("✅  Server build complete\n");
}

async function main() {
  const start = Date.now();
  await buildClient();
  await buildServer();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`🎉  Build complete in ${elapsed}s`);
  console.log(`    Start with: npm start`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
