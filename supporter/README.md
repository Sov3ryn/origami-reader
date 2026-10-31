# Offline supporter keys

Supporters can unlock all cosmetics immediately. Every cosmetic remains earnable through the existing achievement ladder. Activation does not award achievements or change reading statistics.

The app verifies Ed25519 grants offline using `public-keys.json`. It saves the grant separately from library data, in the app configuration directory as `supporter-key.txt`. Readers can paste a grant again, import a `.origami-supporter` file, or export a backup from Settings > About and support. Keys have no expiry, device limit, email address or online validation requirement. A reinstall that removes app data requires the saved key or backup file again.

## Owner tools

The signing key must stay outside the repository and out of app builds. Keep an encrypted backup of it. Never replace an existing signing key merely to issue another grant. If a signing key is eventually rotated, keep previous public keys in the app so previously issued grants continue to work.

```
node scripts/supporter-key.mjs issue <absolute-private-key-path> <absolute-output-path.origami-supporter>
```

Both paths must be outside the repository. The tool refuses to overwrite an existing output. `init <absolute-private-key-path>` creates a signing key only for a genuinely new deployment and prints its public key map. Do not run it again for this deployment. The matching public key is already in `public-keys.json`.

## Launch delivery

The owner permits key sharing, so the same signed key can be given to all supporters. It does not need to be issued separately for each donation. A local supporter file and draft thank-you text have been prepared outside Git. No account settings have been changed, no email has been sent, and no backend has been deployed.

Ko-fi offers a short thank-you message in Payment Settings. Before relying on that for delivery, check the field's current length limit and verify where the complete key appears for both guest tips and memberships. Manual delivery from the Origami support mailbox is available in the meantime. A digital shop download is another possible delivery mechanism, but must not silently replace the owner's donation flow.

GitHub can host the app's releases and static site. GitHub Pages cannot run a webhook receiver. Unique keys delivered automatically would need a separate HTTPS service, verified Ko-fi notifications, duplicate-payment handling, durable delivery retries and an email sender. Those pieces are intentionally not configured for launch while the shared-key option is evaluated. Do not put a signing key, webhook token or mailbox credential in GitHub Pages, browser code, or a public repository.

Sources: [Ko-fi setup](https://help.ko-fi.com/hc/en-us/articles/360014098514-Getting-started-on-Ko-fi), [Ko-fi webhooks](https://help.ko-fi.com/hc/en-us/articles/360004162298-Does-Ko-fi-have-an-API-or-webhook), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Verification

```
node --test supporter/keys.test.mjs
node node_modules/vitest/vitest.mjs run tests/supporter.test.ts tests/bookmarks.test.ts
cargo test --manifest-path src-tauri/Cargo.toml supporter::tests --lib
node node_modules/@playwright/test/cli.js test e2e/supporter.spec.ts
node scripts/extract-strings.mjs --check
```

The cross-language fixture contains only a disposable public key and test grant. It is not trusted by the production app. Tests cover tampering, wrong product, repeat use, old issue dates, email line wrapping, replacement of a stored grant, restoration into a new directory, startup races, unchanged achievements and visible UI errors. Live payment delivery and an installed release remain separate launch checks.
