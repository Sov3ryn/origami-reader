# Installer review

> **Superseded on 16 October 2026:** Origami's own license changed from MPL 2.0 to PolyForm Strict 1.0.0 for the source and APP-LICENSE.md for the app. MPL-specific points below no longer apply; third-party findings still do.

Reviewed 13 October 2026: installer/src (interface), installer/src-tauri (native shell), installer/scripts (packaging, install transaction, launcher, uninstall). Licensing questions are in LICENSING-REVIEW-2026-10-13.md.

## Done in this pass

- **Names.** The installer is "Origami Reader Installer" (window, page title, launcher `Origami Reader Installer.exe`, prerequisite messages). The installed app is "Origami Reader": window title, product name, Start menu and desktop shortcuts, Windows uninstall entry. The internal setup window is `origami-installer-ui.exe`, so only one friendly name appears in the package folder.
- **Language.** The installer opens in the operating system language (20 languages, with flags) and offers a language picker on the Welcome step. The choice is saved as the reader's interface language. "Match system language" is available in both.
- **Offline and private.** The Welcome step says plainly that Origami Reader works without internet, has no account, ads, tracking or data collection, and keeps books, notes and voices on the computer. The reader repeats this in Settings, About and privacy.
- **Start menu, Dock, applications menu.** A new option, on by default: Windows Start menu entry, macOS Dock, Linux applications menu (freedesktop .desktop file). Desktop shortcut and start-at-login now also work on Linux. Windows does not let installers pin to Start or the taskbar; the option explains how to pin it yourself.
- **This computer.** The Installation step shows the detected system, processor and graphics, and recommends the matching speech engine: NVIDIA (CUDA), Apple silicon (Metal) or processor. It warns when the package was built for another operating system.
- **Scene art.** The installer uses the reader's WebP scenes and includes the new day and night scenes.

## Recommended next changes

1. **Split the download.** The full kit is above 4 GB. A small installer (tens of MB) that downloads only what is selected is friendlier, and you can host it for free:
   - App installers: GitHub Releases (free for public repositories, files up to 2 GB each).
   - Voice packs and models: a public Hugging Face repository (free). Even better for licensing, the installer can download the Qwen and DreamShaper weights from their official repositories instead of you redistributing them, showing each license before download.
   - The installer already detects OS, architecture and graphics; it can then pick the CUDA, Metal or CPU runtime automatically.
2. **A download page that picks the right file.** A single static page (GitHub Pages, free) can read the browser's platform and offer the matching installer first: Windows x64, macOS Apple silicon or Intel, Linux AppImage or deb. Keep links to the other versions below it.
3. **Default selections.** Native setup currently selects every language pack and both image features. When downloads arrive, preselect the voice pack for the chosen language plus English, and leave image generation off with a short explanation of its size.
4. **Upgrade and repair.** Setup refuses existing folders, so a new version cannot be installed over an old one. Add an update mode that reads the installation receipt, replaces app files and keeps the library, voices and settings.
5. **Uninstaller.** Uninstall runs a PowerShell script with ExecutionPolicy Bypass, which some antivirus tools flag. A native uninstaller (the setup window in uninstall mode, or an NSIS uninstaller) is more trustworthy and can show "your library is kept" clearly.
6. **"Check for updates".** The toggle is shown but disabled and not implemented. Hide it until it exists. When it does, make it opt-in and say what it contacts, so the offline promise stays true.
7. **Code signing.** Unsigned installers trigger Windows SmartScreen and macOS Gatekeeper warnings, which scare people away. Free or cheap options: SignPath Foundation (free for open-source projects), Azure Trusted Signing (low monthly cost). macOS requires an Apple Developer account for notarization.
8. **Licenses on screen.** The DreamShaper license is shown and must be accepted. Add a combined "Third-party licenses" screen with the Qwen (Apache 2.0) and other notices, and a line linking to the source code (required by MPL 2.0 for binaries).
9. **Voices.** The bundled voice references need to be replaced or cleared before a public release (see the licensing review).
10. **Portable preview.** The single-file HTML preview cannot load translations (they load as separate files), so it stays in English. The real installer and the local preview are translated.

## Not changed

- The install transaction, hash verification, pause, resume, cancel and receipt logic look careful and were left as they are.
- macOS and Linux installers still need building on those systems. The Linux menu entry and macOS Dock code is written but has not been run there.
