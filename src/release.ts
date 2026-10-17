// Release channel. Private beta builds say so in the window title, beside
// the Origami name and in About and support, so a copy passed around outside
// the trusted testers is easy to recognize. For a public release, set
// PRIVATE_BETA to false and change the window title in
// src-tauri/tauri.conf.json back to "Origami Reader".
export const PRIVATE_BETA = true;
export const VERSION = "0.1.0-beta.6";
// The day this build was made, stamped by Vite.
export const BUILD_DATE: string = __BUILD_DATE__;
