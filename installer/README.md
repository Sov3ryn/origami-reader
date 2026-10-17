# Origami installer

The same interface now supports two modes:

- Browser preview: menus and simulated progress, without installation actions.
- Native Windows setup: installs the app, selected voice packs and model/runtime files from an offline payload, verifies SHA-256 while copying, writes per-user configuration, applies the chosen starting appearance, creates shortcuts/startup entries and launches the reader.

The native installer supports fresh per-user installations. It refuses existing destination directories and existing worker/model configurations. Cancellation removes only the staging directory created by that installation attempt. Existing libraries and reading preferences are retained. Uninstall removes the files recorded in the installation receipt and preserves the library database.

All 43 voice references are included in the full kit: 20 English, 10 Korean, 10 Hindi and 3 Spanish. Hindi is experimental because the bundled Qwen model does not officially support it. The image model is shared by covers and portraits. Recipients must accept its OpenRAIL-M terms before installing it. All four packs and both image features start selected in native setup, while users can deselect them.

Start with `FRIEND-BETA.txt` for recipient instructions and `PLATFORM-BUILDS.md` for build commands, Linux/macOS work remaining and runtime validation limits. Payloads are generated outside Git. Neither the app's local library nor the developer's absolute worker paths are redistributed.

## Browser interface development

Run `npm ci` at the repository root, then `npm run dev` from this directory. The preview opens at http://127.0.0.1:1432. `npm run build` type-checks and creates the static site plus `dist/Origami-Setup-Preview.html`. The portable HTML remains a design preview, not an installer.

## Native package components

- `src-tauri`: setup shell, native folder chooser, install progress/control bridge and installed-app launch.
- `scripts/install.py`: isolated offline copying and configuration transaction.
- `scripts/package-windows.py`: explicit private asset inventory, grouping and hash manifest.
- `scripts/SetupLauncher.cs`: Windows prerequisites entry point.
- `scripts/finish-windows.ps1`: downloads and authenticates Microsoft runtime installers and compiles the entry point.
- `scripts/Uninstall Origami.ps1`: receipt-based removal, preserving user data.

The app is covered by APP-LICENSE.md; its source is source-available under PolyForm Strict 1.0.0. Python dependencies and models retain their own license notices. No tests are run by the packaging scripts. Clean-machine installation and platform runtime checks remain separate, pending work.

## Appearance

Six presets use the app's own defaultSceneAppearance values and visual renderer: Plum Nocturne, Spring Morning, Summer Evening, Autumn Dusk, Winter Daylight and Paper Hills. Plum uses dark paper. Textures, background images, transparency and ambient effects appear in the preview and become first-run preferences. Reduced motion and OS accessibility preferences are respected.
