import "@fontsource/dm-sans/300.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { requestRemotePermissions } from "./lib/host/permissions";

// Fire host network-permission request before any UI mounts so the prompt
// queues up the moment the host handshake completes — never gated by a React
// effect or user interaction. Allowances (Bulletin + Statement Store), device
// permissions and the `StatementSubmit` permission are requested up front by
// the onboarding gate on first entry (see components/onboarding/OnboardingGate),
// then lazily on first use via `ensureBootstrap` / the JIT wrappers as a
// fallback.
void requestRemotePermissions();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
