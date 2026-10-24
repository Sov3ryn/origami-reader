/*
 * Copies the places pack into the app: plates and sprites as WebP in public/places, occlusion masks and filled
 * skies in public/places/masks, and the catalog with its scene data as src/places/places.json.
 *   node tools/places/export.cjs [pack folder]   (default .local/origami-backgrounds)
 * The pack's source PNGs stay outside Git. Needs Playwright's Chromium for the WebP encoding.
 */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {chromium} = require('playwright');
const repo = path.resolve(__dirname, '..', '..');
const pack = path.resolve(process.argv[2] || path.join(repo, '.local', 'origami-backgrounds'));
const out = path.join(repo, 'public', 'places'), masks = path.join(out, 'masks');
const URL_ROOT = 'https://pack.invalid/';

// Evaluates the pack's catalog against a fake script URL, so image paths can be rewritten.
function readCatalog() {
  const context = {window: {}, document: {currentScript: {src: URL_ROOT + 'catalog.js'}}, URL};
  vm.createContext(context);
  for (const file of ['scene-data.js', 'catalog.js']) vm.runInContext(fs.readFileSync(path.join(pack, file), 'utf8'), context);
  return JSON.parse(JSON.stringify(context.window.OrigamiScenes));
}
const local = url => url && url.startsWith(URL_ROOT) ? url.slice(URL_ROOT.length) : url;
const appUrl = file => '/places/' + file.replace(/^assets\//, '').replace(/\.png$/, '.webp').replace(/^masks\/(.*)\.webp$/, 'masks/$1.png');

(async () => {
  const scenes = readCatalog();
  fs.rmSync(out, {recursive: true, force: true}); fs.mkdirSync(masks, {recursive: true});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const webp = async (file, quality) => {
      const src = 'data:image/png;base64,' + fs.readFileSync(path.join(pack, file)).toString('base64');
      const data = await page.evaluate(async ([src, quality]) => {
        const img = new Image(); img.src = src; await img.decode();
        const c = Object.assign(document.createElement('canvas'), {width: img.naturalWidth, height: img.naturalHeight});
        c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/webp', quality);
      }, [src, quality]);
      const target = path.join(repo, 'public', appUrl(file).slice(1));
      fs.writeFileSync(target, Buffer.from(data.split(',')[1], 'base64'));
      return fs.statSync(target).size;
    };
    let total = 0;
    for (const s of scenes) total += await webp(local(s.image), 0.88);
    for (const sprite of new Set(scenes.flatMap(s => s.effects.map(e => local(e.sprite)).filter(Boolean)))) total += await webp(sprite, 0.92);
    for (const f of fs.readdirSync(path.join(pack, 'assets', 'masks'))) {
      fs.copyFileSync(path.join(pack, 'assets', 'masks', f), path.join(masks, f)); total += fs.statSync(path.join(masks, f)).size;
    }
    const placeUrl = url => url ? appUrl(local(url)).replace(/\/places\/masks\/(.*)\.png$/, (m, name) => name.endsWith('skyfill') ? `/places/masks/${name}.jpg` : m) : url;
    const fixSkyfill = url => url && url.replace(/-skyfill\.png$/, '-skyfill.jpg');
    const catalog = scenes.map(s => ({
      ...s, image: placeUrl(s.image),
      effects: s.effects.map(e => e.sprite ? {...e, sprite: placeUrl(e.sprite)} : e),
      masks: s.masks ? {sky: placeUrl(s.masks.sky) || undefined, outside: placeUrl(s.masks.outside) || undefined} : undefined,
      drift: s.drift ? {...s.drift, mask: placeUrl(s.drift.mask), skyfill: fixSkyfill(placeUrl(s.drift.skyfill))} : undefined
    }));
    fs.writeFileSync(path.join(repo, 'src', 'places', 'places.json'), JSON.stringify(catalog) + '\n');
    console.log(`${scenes.length} places, ${(total / 1048576).toFixed(1)} MB in public/places`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
