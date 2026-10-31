import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./coverGilding.css";
import { BETA } from "./release";
// The desktop window title comes from tauri.conf.json; this matches it.
if (BETA) document.title = "Origami Reader · Beta";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
