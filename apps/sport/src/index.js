import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { register } from "./serviceWorkerRegistration";

createRoot(document.getElementById("root")).render(<App />);

register();
