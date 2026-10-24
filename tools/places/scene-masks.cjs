/*
 * Mask settings per scene, in source fractions. Used by tools/build-scene-data.cjs.
 * sky:     grown from seed points through smooth, similar colours inside `region`, then gaps between
 *          leaves or mullions are matched against the nearby sky colour. `drift` makes the painted clouds
 *          move; `cut` circles (sun, moon) stay still.
 * outside: pixels inside `region` that pass `pred(r, g, b, l)`; used for things seen through windows.
 */
const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
const rounded = (x1, y1, x2, y2, r, a = 941 / 1672) => {
  const pts = [];
  for (const [cx, cy, s] of [[x2 - r * a, y1 + r, -90], [x2 - r * a, y2 - r, 0], [x1 + r * a, y2 - r, 90], [x1 + r * a, y1 + r, 180]])
    for (let d = 0; d <= 90; d += 15) { const t = (s + d) * Math.PI / 180; pts.push([cx + Math.cos(t) * r * a, cy + Math.sin(t) * r]); }
  return pts;
};
const circle = (x, y, r) => ({circle: [x, y, r]});
const drift = {distance: 50, period: 110};

module.exports = {
  'new-year': {sky: {region: [rect(.19, 0, 1, .40)], seeds: [[.5, .1], [.9, .1], [.3, .2]]}},
  'lunar-new-year': {sky: {region: [rect(.2, 0, 1, .42)], seeds: [[.6, .08], [.9, .05], [.75, .2]], drift}},
  'valentine': {
    sky: {region: [rect(0, 0, .585, .5), rect(.613, 0, .668, .5)], seeds: [[.40, .05], [.55, .2]], drift},
    outside: {region: [[[0, 0], [.585, 0], [.585, .655], [0, .735]], rect(.613, 0, .668, .62)], pred: '!(r - b > 40 && l < 90)', addSky: true}
  },
  'carnival': {sky: {region: [rect(.33, 0, 1, .38)], seeds: [[.75, .05], [.6, .1]], drift}},
  'nowruz': {sky: {region: [rect(.2, 0, 1, .35)], seeds: [[.5, .03], [.65, .05]], drift}},
  'easter': {sky: {region: [rect(.45, 0, .85, .30)], seeds: [[.62, .17], [.66, .22]], drift}},
  'ramadan': {sky: {region: [rect(.4, 0, .97, .25)], seeds: [[.75, .08], [.55, .12], [.7, .15]]}},
  'eid': {sky: {region: [rect(.42, 0, .78, .25)], seeds: [[.6, .05]]}},
  'midsummer': {sky: {region: [rect(.45, 0, 1, .39)], seeds: [[.8, .05], [.7, .28], [.9, .25], [.65, .33]], gmax: 9, step: 10, tol: 30, cut: [circle(.769, .358, .035)], drift}},
  'saint-jean': {sky: {region: [rect(.36, 0, .97, .33)], seeds: [[.6, .05], [.8, .1]], drift}},
  'national-day': {sky: {region: [rect(.2, 0, .93, .42)], seeds: [[.5, .05], [.7, .2], [.85, .3]], drift}},
  'harvest': {
    sky: {region: [rect(.44, 0, 1, .30)], seeds: [[.6, .12], [.65, .25]], drift},
    outside: {region: [rect(.44, 0, 1, .45)], pred: '!(r - b > 45 && l < 95)', addSky: true}
  },
  'halloween': {
    sky: {region: [rect(.42, 0, .82, .45)], seeds: [[.62, .2], [.6, .06]], cut: [circle(.6, .138, .03)]},
    outside: {region: [rect(.42, 0, .82, .55)], pred: 'b > r + 10'}
  },
  'dia-de-muertos': {sky: {region: [rect(.42, .22, .72, .4)], seeds: [[.48, .3], [.62, .3]], drift: {distance: 25}}},
  'diwali': {sky: {region: [rect(.38, 0, .92, .38)], seeds: [[.7, .05], [.8, .2]]}},
  'hanukkah': {outside: {region: [rect(.52, 0, 1, .5)], pred: 'b > r + 5'}},
  'christmas': {outside: {region: [rect(.40, 0, .83, .385)], pred: '!(r - b > 35 && l < 150)'}},
  'winter-solstice': {
    sky: {region: [rect(.33, 0, .77, .4)], seeds: [[.5, .05], [.65, .2]]},
    outside: {region: [rect(.17, 0, .77, .68)], pred: 'b > r - 5'}
  },
  'rainy-bookshop': {outside: {region: [rect(.42, 0, .72, .46), rect(.765, .03, .87, .43)], pred: '!(r - b > 30 && l < 130)'}},
  'midnight-express': {
    sky: {region: [rect(.25, .02, .83, .36)], seeds: [[.5, .08], [.4, .25]], gmax: 9, step: 10, tol: 30, drift},
    outside: {region: [rounded(.25, .02, .828, .575, .03)]}
  },
  'fox-retreat': {sky: {region: [rect(.62, 0, .98, .34)], seeds: [[.82, .18], [.8, .27]], drift}},
  'tidal-library': {
    sky: {region: [rect(.36, 0, .69, .34)], seeds: [[.5, .05], [.6, .2]], drift},
    outside: {region: [rect(.363, 0, .688, .62)]}
  },
  'observatory': {
    sky: {region: [rect(.33, 0, .88, .42)], seeds: [[.45, .1], [.75, .05]]},
    outside: {region: [rect(.33, 0, .88, .5)], pred: 'b > r + 5'}
  },
  'lantern-garden': {sky: {region: [rect(.33, 0, .65, .2)], seeds: [[.5, .05]]}},
  'sunken-archive': {outside: {region: [rect(.2, 0, .88, .66)], pred: 'b > r + 15'}},
  'last-bloom': {sky: {region: [rect(.4, 0, 1, .35)], seeds: [[.8, .15], [.65, .2], [.75, .3], [.9, .25]], drift}},
  'orbital-room': {outside: {region: [rect(.24, 0, .97, .6)], pred: 'b >= r - 6 && !(l > 150 && r > b)'}},
  'origami-valley': {sky: {region: [rect(.15, 0, 1, .32)], seeds: [[.5, .03], [.8, .05]], drift}},
  'impossible-library': {
    sky: {region: [rect(.17, 0, .92, .75)], seeds: [[.6, .05], [.65, .2], [.5, .6], [.45, .5], [.33, .35]], cut: [circle(.307, .433, .02)], drift}
  }
};
