#!/usr/bin/env node
// GitHub push script using direct fetch API with token from integration
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const REPO = "myyacoolmei-a11y/erp-shengfeng";
const OWNER = "myyacoolmei-a11y";
const REF = "heads/main";

// Get all tracked files
default function getFiles(dir, base = dir, files = []) {
  const items = readdirSync(dir);
  for (const item of items) {
    const full = join(dir, item);
    const rel = relative(base, full);
    if (item === ".git" || item === "node_modules") continue;
    if (rel.startsWith("node_modules/")) continue;
    const s = statSync(full);
    if (s.isDirectory()) {
      getFiles(full, base, files);
    } else {
      files.push(rel);
    }
  }
  return files;
}

// Read token from integration
try {
  const { listConnections } = await import("@replit/connectors-sdk");
  const conns = await listConnections("github");
  const conn = conns[0];
  const client = conn.getClient();
  const token = client.access_token || client.oauth?.credentials?.access_token;

  if (!token || token === "[redacted]") {
    console.error("Could not get GitHub token");
    process.exit(1);
  }

  // Get current ref
  const refRes = await fetch(`https://api.github.com/repos/${REPO}/git/ref/${REF}`, {
    headers: { Authorization: `token ${token}` }
  });
  const refData = await refRes.json();
  const currentSha = refData.object.sha;

  // Get tree
  const commitRes = await fetch(`https://api.github.com/repos/${REPO}/git/commits/${currentSha}`, {
    headers: { Authorization: `token ${token}` }
  });
  const commitData = await commitRes.json();
  const treeSha = commitData.tree.sha;

  console.log("Current commit:", currentSha.substring(0,7));
  console.log("Tree:", treeSha.substring(0,7));
  console.log("Token available:", !!token);

} catch (e) {
  console.error("Error:", e);
  process.exit(1);
}
