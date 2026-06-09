// Product manifest for the LocalDOT app. Without this file bulletin-deploy can
// only publish a "legacy contenthash" — no product icon, displayName, or
// app.<domain>.dot subname. With it, bulletin-deploy walks up from the build dir
// (apps/web/dist), finds this config, and ALSO writes the full Polkadot product
// manifest + executable records on <domain> and its app subname.
//
// `domain` MUST equal the domain bulletin-deploy is invoked with or the manifest
// publish aborts. The domain is chosen interactively in scripts/deploy.ts, so
// it's threaded in via the BULLETIN_DEPLOY_DOMAIN env var that deploy.ts sets
// alongside MNEMONIC; the fallback is only used for a manual standalone run
// (a 9+ char NoStatus-registrable label — see the naming rules in deploy.ts).
//
// `icon.path` and `executables[].path` resolve relative to THIS file. `./dist`
// is Vite's static-export directory and is exactly the build dir deploy.ts
// uploads, so the app executable reuses that already-stored CID instead of
// re-uploading the same bytes. This is a single SPA — no widget/worker build —
// so `app` is the only executable.
//
// NOTE: this file is excluded from the app's tsconfig, so it is never
// type-checked by `vite build`. At publish time bulletin-deploy loads it via
// jiti, which resolves any imports relative to THIS file — and bulletin-deploy
// is never installed in the app's node_modules (only globally / via npx). So
// `import { defineConfig } from "bulletin-deploy"` would throw "Cannot find
// module 'bulletin-deploy'" and abort the manifest publish. defineConfig is only
// an identity helper (config => config) for editor hints, so we define it
// locally instead: zero runtime dependency, same authoring shape.
const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  domain: process.env.BULLETIN_DEPLOY_DOMAIN ?? "localdotapp.dot",
  displayName: "LocalDOT",
  description:
    "Peer-to-peer cash-to-token exchange on Polkadot — find nearby providers and settle trades on-chain.",
  icon: { path: "./icon.png", format: "png" },
  executables: [
    {
      kind: "app",
      path: "./dist",
      appVersion: [1, 0, 0],
    },
  ],
});
