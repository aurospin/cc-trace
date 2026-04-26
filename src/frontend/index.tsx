import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
