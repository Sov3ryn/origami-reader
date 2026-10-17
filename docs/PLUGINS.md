# Work mode plugins

Plugins add commands, panels and small tools to Work mode. They are folders
of plain files kept in Origami's data folder, under `Plugins/`, and managed in
Settings, Work mode, Plugins (add from a folder, turn on or off, remove, or
turn every plugin off at once). A sample, "Note tools", can be added from
there; its source is in `plugins/sample-note-tools/`.

## Safety

- Each plugin runs in its own sandboxed frame, served from
  `http://oplugin.localhost/<id>/` (`oplugin://localhost/<id>/` on macOS and
  Linux). Its policy allows only its own files: no internet (no `fetch`,
  images or fonts from elsewhere), no frames, no forms, no pop-ups.
- The plugin frame sits inside a relay frame whose policy keeps it inside the
  plugin's folder, so a plugin cannot navigate itself to a website to send
  data out.
- Plugins never see the app, other plugins, files or settings. They ask
  Origami for things through `window.origami`, and each call is checked
  against the permissions the reader granted.
- Notes and cards in vaults are never given to plugins, and plugins cannot
  change them.
- HTML a plugin sends (new notes, inserted text) goes through the note schema
  like an import: scripts, styles and unknown elements are dropped, and
  embeds become plain links.
- Replacing a note's text keeps the previous text in the note's History.

## A plugin folder

```
my-plugin/
  manifest.json
  main.js
  style.css      (optional)
  anything else the plugin loads (images, more scripts)
```

`manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "author": "You",
  "description": "What it does, in a sentence.",
  "main": "main.js",
  "style": "style.css",
  "permissions": ["notes:read", "notes:write"],
  "panel": { "title": "My panel" }
}
```

- `id`: 2 to 40 lowercase letters, digits or dashes; the folder is named after it.
- `permissions`: any of `notes:read`, `notes:write`, `cards:read`, `cards:write`.
  The reader sees them in plain words and approves them before the plugin runs.
- `panel` (optional): the plugin's page is shown as a floating panel, opened
  from the ··· menu or Search (Ctrl+K). Without it, the plugin runs hidden and
  offers commands.

Origami builds the page: `__origami.js` (the API), then `main` at the end of
the body, with `style` linked in the head.

## The API

Every call returns a promise.

| Call | Needs | Returns |
|---|---|---|
| `origami.commands.register(id, label, run)` | | Adds a command to Search (Ctrl+K) and the note's `/` menu. |
| `origami.notes.list()` | notes:read | `[{ id, title, updated, subject, tags }]` |
| `origami.notes.get(id)` | notes:read | `{ id, title, html, text, updated }` or `null` |
| `origami.notes.current()` | notes:read | The open note, or `null` |
| `origami.notes.onOpen(fn)` | | `fn(id)` when a note opens (`null` when none is open) |
| `origami.editor.selection()` | notes:read | The selected text in the open note |
| `origami.notes.create(title, html)` | notes:write | The new note's id |
| `origami.notes.append(id, html)` | notes:write | |
| `origami.notes.replace(id, html)` | notes:write | (the old text goes to History) |
| `origami.editor.insert(html)` | notes:write | Inserts at the cursor in the open note |
| `origami.cards.list()` | cards:read | `[{ id, type, front, back, subject }]` |
| `origami.cards.create(front, back)` | cards:write | The new card's id (no back: a fill-in-the-blank card using `{{ }}`) |
| `origami.ui.notify(text)` | | Shows a short message |
| `origami.ui.close()` | | Closes the plugin's panel |
| `origami.ui.onTheme(fn)` | | `fn(dark)` when the theme changes; `<html data-theme>` is set too |
| `origami.storage.get(key)` / `set(key, value)` | | The plugin's own small store (256 KB, JSON values) |
| `origami.blocks.register(type, label)` | | Adds a block to the note's `/` menu |
| `origami.block` | | Set when the plugin runs as a block in a note (`null` otherwise) |
| `origami.block.get()` / `save(data)` | | The block's own data, saved in the note (JSON, 64 KB) |
| `origami.block.resize(height)` | | The block's height in pixels |

## Blocks in notes

A plugin can draw blocks inside notes (a timer, a poll, a widget). Register a
type in the plugin's normal start, and when the plugin page opens with
`origami.block` set, draw that block instead of the panel. Each block runs in
its own sealed frame. It can only read and save its own data, set its height,
show a message and use the plugin's small store: it never sees the note or the
rest of the app. When the plugin is off or removed, the block shows a notice
and keeps its data. The sample adds a focus timer block.

Note HTML is what the editor stores: paragraphs, headings, lists, task lists
(`<ul data-type="taskList">`), tables, callouts (`<div data-callout="tip">`),
note links (`<a data-note="Title">`), study card lines (`question :: answer`),
dates (`@2026-10-20`), formulas (`<span data-type="inline-math" data-latex="...">`)
and diagrams (`<div data-diagram="flowchart LR ...">`).

## Example

```js
const api = window.origami;
api.commands.register("shout", "Shout the selection", async () => {
  const text = await api.editor.selection();
  if (text) await api.editor.insert(`<p><strong>${text.toUpperCase()}</strong></p>`);
});
```

## Not yet

- Importers and exporters, sidebar sections and themes from plugins.
- A plugin directory; for now plugins are shared as folders.
