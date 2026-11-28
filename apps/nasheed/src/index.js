import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./generated/tokens.css";
import "./styles.css";
import { startTheme } from "./theme";

startTheme();
createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
