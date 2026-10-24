# Places to read

The 31 painted places (19 celebrations, 12 reading milestones) and their animations.

- `src/places/origami-backgrounds.js`: the `<origami-background>` renderer (canvas effects, CSS-masked occlusion, drifting painted skies).
- `src/places/places.json`: generated catalog (effects, masks, filled skies, ambient light grid, unlock rules).
- `src/places.ts`: unlock rules, celebration dates and unlock hints. `src/useReadingStats.ts` counts reading time.
- `public/places/`: plates and sprites as WebP, masks as PNG, filled skies as JPEG.

The source pack (PNG plates, preview gallery, its own tests) is kept outside Git. To change effects or masks, edit
`catalog.js` or `scene-masks.cjs` in the pack, run `node tools/build-scene-data.cjs` there, then from the repository:

```bash
node tools/places/export.cjs path/to/origami-backgrounds
```

`catalog.js`, `scene-data.js`, `scene-masks.cjs` and `build-scene-data.cjs` here are copies of the pack's files at the
time of the last export. `PACK-README.md` and `PACK-VALIDATION.md` describe the pack.
