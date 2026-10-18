// Release channel. Private beta builds say so in the window title, beside
// the Origami name and in About and support, so a copy passed around outside
// the trusted testers is easy to recognize. For a public release, set
// PRIVATE_BETA to false and change the window title in
// src-tauri/tauri.conf.json back to "Origami Reader".
export const PRIVATE_BETA = true;
export const VERSION = "0.1.0-beta.8";
// Studio is in development: on in development builds, or with VITE_STUDIO=1.
export const STUDIO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_STUDIO === "1";
// The day this build was made, stamped by Vite.
export const BUILD_DATE: string = __BUILD_DATE__;
