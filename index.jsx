import "./src/guest/boot.js";
import React from "react";
import { createRoot } from "react-dom/client";
import App, { APP_VERSION } from "./App.jsx";
import ErrorBoundary from "./src/components/ErrorBoundary.jsx";
import { installDiagnostics } from "./src/diagnostics/index.js";
import { initFluent } from "./src/fluent/fluent.js";
import { initSkin } from "./src/skins/skin.js";

installDiagnostics(APP_VERSION);
initSkin();
initFluent();
createRoot(document.getElementById("root")).render(<ErrorBoundary><App/></ErrorBoundary>);
