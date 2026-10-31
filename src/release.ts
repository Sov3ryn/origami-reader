// Release channel. Beta builds say so in the window title, beside the
// Origami name and in About and support. For a stable release, set BETA to
// false and change the window title in src-tauri/tauri.conf.json back to
// "Origami Reader".
export const BETA = true;
export const VERSION = "0.1.0-beta.21";
// Studio is in development: on in development builds, or with VITE_STUDIO=1.
export const STUDIO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_STUDIO === "1";
// The day this build was made, stamped by Vite.
export const BUILD_DATE: string = __BUILD_DATE__;
