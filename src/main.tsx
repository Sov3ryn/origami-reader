import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./coverGilding.css";
import { PRIVATE_BETA } from "./release";
// The desktop window title comes from tauri.conf.json; this matches it.
if (PRIVATE_BETA)
  document.title = "Origami Reader · Private beta · Not for redistribution";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
