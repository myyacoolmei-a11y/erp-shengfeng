---
name: JWT auth setup
description: Quirk when adding JWT auth to api-server — zod/v4 resolution in esbuild
---

When adding route files that import directly from `zod/v4` (e.g. for inline Zod schemas), the api-server esbuild bundle fails with "Could not resolve zod/v4" unless `zod` is a direct dependency of `@workspace/api-server`.

**Why:** api-server bundles everything via esbuild. Even though `@workspace/api-zod` and `@workspace/db` both depend on zod, esbuild resolves from the package's own node_modules tree. Without a direct dep, `zod/v4` is not found.

**How to apply:** Any time a new route or lib file in `artifacts/api-server/src/` imports from `zod` or `zod/v4`, ensure `"zod": "catalog:"` is in `artifacts/api-server/package.json` dependencies.
