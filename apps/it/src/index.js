import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./generated/tokens.css";
import "./styles.css";
import { startFreshApp } from "./pwa/entryUpdate";
import { startTheme } from "./theme";

startTheme();
startFreshApp(() => createRoot(document.getElementById("root")).render(<App />));
