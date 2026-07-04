#!/usr/bin/env node
import { execSync } from "child_process";
import process from "process";

const REMOTE = "https://github.com/myyacoolmei-a11y/erp-shengfeng.git";

try {
  console.log("Adding origin remote...");
  execSync(`git remote add origin ${REMOTE}`, {
    cwd: "/home/runner/workspace",
    stdio: "inherit"
  });
} catch (e) {
  console.log("Remote may already exist, continuing...");
}

try {
  console.log("Pushing to origin...");
  execSync("git push -u origin main", {
    cwd: "/home/runner/workspace",
    stdio: "inherit",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0"
    }
  });
  console.log("Push succeeded!");
} catch (e) {
  console.error("Push failed:", e.message);
  process.exit(1);
}
