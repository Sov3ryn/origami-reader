# Updates

Origami can update itself component by component, so a fix to the reading
app is a download of a few megabytes, not a new 20 GB kit. Updates are on from
beta 6.

## How it works

1. The installer writes `components.json` beside the app with the version of
   each part it installed (`app`, `workers`, `python`, `voices`).
2. Settings, About and support, Updates: "Check for updates" downloads
   `{UPDATE_URL}/manifest.json` and `manifest.json.sig`. The list is refused
   unless it is signed with the Origami key (Ed25519).
3. Components newer than the installed ones, and meant for this system, are
   offered with their size. Nothing downloads until the reader clicks
   "Download and install".
4. Each zip is checked against the size and SHA-256 in the signed list, then
   unpacked. A component can only write inside its own folders (`app` writes
   the program, `runtime/` and `licenses/`; `workers` writes `workers/`...).
   Files in use are renamed to `*.update-old` and removed at the next start.
5. If the app itself changed, Origami offers to restart.

Automatic checks (off by default) look once a day and only say that an update
exists; installing is always the reader's choice. Checks send nothing but the
request for the list.

## Where updates live

Updates are on, from beta 6. The app reads
`https://github.com/Sov3ryn/origami-updates/releases/latest/download/manifest.json`
and its `.sig`: the newest release of the public `origami-updates` repository.
The hub itself is private, and the app cannot read a private repository
without a key, so update files live there instead, encrypted:

- The list is signed with the Ed25519 key in `Documents\Origami-keys\origami-update-signing.key`
  (public half in `UPDATE_PUBLIC_KEY`, src-tauri/src/update.rs).
- Each component file is encrypted (XChaCha20-Poly1305, `.origami` files) with
  `Documents\Origami-keys\origami-update-content.key`. The app gets that key at
  build time from `ORIGAMI_UPDATE_CONTENT_KEY`, so only copies built with it
  (friends' copies) can install updates. A build without it can still check,
  and says to download the new version from the Origami page.
- Both key files stay out of Git. Back them up: without the signing key no
  installed copy will accept another update.

## Publishing a new version

1. Build with the content key set (PowerShell):

   ```powershell
   $env:ORIGAMI_UPDATE_CONTENT_KEY = (Get-Content "$HOME\Documents\Origami-keys\origami-update-content.key" -Raw).Trim()
   npx tauri build --no-bundle
   ```

2. Pack, encrypt and sign the changed components (usually `app`, often `workers`):

   ```powershell
   python installer/scripts/make-update.py --version 0.1.0-beta.7 --base-url https://github.com/Sov3ryn/origami-updates/releases/download/v0.1.0-beta.7 --key "$HOME\Documents\Origami-keys\origami-update-signing.key" --content-key "$HOME\Documents\Origami-keys\origami-update-content.key" --notes "What changed" --output ..\work\hub\updates\0.1.0-beta.7 app workers
   ```

3. Publish them as the newest release of origami-updates (the tag must match the base address):

   ```powershell
   gh release create v0.1.0-beta.7 (Get-ChildItem ..\work\hub\updates\0.1.0-beta.7).FullName --repo Sov3ryn/origami-updates --title "Origami Reader 0.1.0 beta 7" --notes "What changed" --latest
   ```

4. Optionally, build a new online kit and add it to the hub for new friends.

Copies with automatic checks on (setup turns them on) see a notice within a
day; anyone can check at once in Settings, About and support, Updates.

For testing, `ORIGAMI_UPDATE_URL` and `ORIGAMI_UPDATE_KEY` override the
address and public key (a local `http://127.0.0.1` server is allowed, and
make-update.py accepts such a base address).

## Manifest format

```json
{
  "format": 1,
  "version": "0.1.0-beta.4",
  "released": "2026-10-20",
  "notes": "Short notes shown in Settings.",
  "components": [
    { "id": "app", "version": "0.1.0-beta.4", "platform": "windows-x64",
      "url": "https://.../app-0.1.0-beta.4-windows-x64.zip",
      "size": 18350080, "sha256": "...", "restart": true }
  ]
}
```

`platform` is `windows-x64`, `linux-x64` or `any`. A list with a newer
`format` asks the reader to download the new version from the website.
Components a kit never had are not added by updates.

## Not done yet

- Hosting, and the real key.
- Delta updates for large components (models and voices are sent whole).
- Linux: the same code works for the app and workers; the AppImage case
  needs its own path.
