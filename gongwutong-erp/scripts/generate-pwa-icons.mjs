#!/usr/bin/env node
/**
 * Generate PWA icons from public/logo.png.
 * Uses macOS `sips` when available; otherwise copies logo.png as fallback.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const logo = path.join(root, "public/logo.png");
const outDir = path.join(root, "public/icons");

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

if (!existsSync(logo)) {
  console.error("Missing public/logo.png");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

function hasSips() {
  try {
    execSync("which sips", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (hasSips()) {
  for (const { name, size } of sizes) {
    const out = path.join(outDir, name);
    execSync(`sips -z ${size} ${size} "${logo}" --out "${out}"`, { stdio: "inherit" });
  }
  console.log("PWA icons generated with sips");
} else {
  for (const { name } of sizes) {
    copyFileSync(logo, path.join(outDir, name));
  }
  console.warn("sips not found — copied logo.png to icon paths (install sips or resize manually)");
}
