/* All overlay coordinates are normalized to the source photograph, not the viewport. */
(function () {
  'use strict';
  const root = new URL('.', document.currentScript.src);
  const p = (type, options = {}) => ({ type, ...options });
  const rect = (x1,y1,x2,y2) => [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
  const sprite = (name,at,width,extra={}) => p('sprite',{sprite:new URL(`assets/${name}.png`,root).href,at,width,still:true,...extra});
  // Lamps are [x, y, radius in source pixels]; they flicker gently on top of lights already painted in the plate.
  const lamps = (anchors, extra={}) => p('lamps',{anchors,...extra});
  const BLOSSOM = ['#fbe3ea','#f6c9d6','#ffffff','#f2b5c6'];
  const AUTUMN = ['#c2562b','#df8f2f','#e8b947','#8f3a22','#a2a04c'];
  const MAPLE = ['#c8341e','#e0502a','#a8261a','#e8792f'];
  const rows = [
    ['new-year','New Year’s','The Midnight Rooftop','holiday',[
      p('stars',{clip:rect(.22,0,1,.3),count:22,every:23}),
      p('fireworks',{clip:[[0.27,0],[1,0],[1,0.34],[0.27,0.34]],palette:['#ffd166','#f4f4ff','#7bc6ff','#ff6fb5','#c59bff','#ff8a5c']}),
      p('snow',{clip:[[0.22,0],[1,0],[1,0.62],[0.22,0.49]],count:50}),
      p('steam',{at:[.580,.741],width:.045}),
      lamps([[.102,.515,45],[.23,.53,45],[.323,.71,45],[.41,.71,45],[.834,.80,50],[.89,.83,45],[.10,.13,50]])]],
    ['lunar-new-year','Lunar New Year','The Lantern Courtyard','holiday',[
      p('smoke',{at:[.072,.688],strength:.2}),p('steam',{at:[.086,.758],width:.046,size:.8}),
      p('sky-lanterns',{clip:[[.47,0],[1,0],[1,.14],[.62,.24],[.47,.24]],count:7}),
      p('lanterns',{anchors:[[0.23,0.065],[0.40,0.025]]}),
      p('petal',{clip:rect(.19,0,.65,.71),count:16,palette:['#e8576b','#f28a9b','#d93a52','#f7c1cb']}),
      p('water',{clip:[[.53,.63],[.98,.63],[.98,.80],[.84,.83],[.55,.72]],glint:'#ffb070',ripples:5}),
      lamps([[.707,.43,45],[.861,.42,45],[.40,.60,35]],{color:'#ff9a4a'})]],
    ['valentine','Valentine’s Day','Letters by the Window','holiday',[
      p('birds',{clip:rect(.3,.02,.6,.3),color:'#55555c',size:5,every:23}),
      p('rain',{clip:[[0,0],[0.585,0],[0.585,0.66],[0,0.74]],count:170,glass:14,slant:.14,color:'#7f8894',strength:1.6,layer:'outside'}),
      p('rain',{clip:rect(.613,0,.668,.62),count:24,glass:3,slant:.14,color:'#7f8894',strength:1.6,layer:'outside'}),
      p('steam',{at:[.682,.699],width:.042}),p('steam',{at:[.903,.709],width:.05}),
      lamps([[.77,.11,45],[.936,.21,40],[.072,.30,30],[.185,.35,30],[.53,.335,30],[.297,.425,22],[.372,.435,22]])]],
    ['carnival','Carnival / Mardi Gras','The Quiet Balcony','holiday',[
      p('mist',{clip:rect(.6,.5,.85,.75),color:'#ffd9b0',strength:.12,size:60}),p('moths',{anchors:[[.21,.15]]}),
      p('confetti',{clip:[[0.49,0],[1,0],[1,0.8],[0.49,0.49]],count:34,size:1.4}),
      p('ribbons',{anchors:[[.795,.455],[.888,.468],[.957,.472]],length:70}),
      p('sparkle',{clip:rect(.41,.66,.49,.79),count:7,color:'#ffe6a0',size:.8}),
      lamps([[.21,.15,60],[.889,.58,28],[.84,.59,25],[.76,.55,22],[.61,.53,22]])]],
    ['nowruz','Nowruz / Spring Equinox','The Returning Garden','holiday',[
      p('birds',{clip:rect(.4,.02,.95,.2),color:'#4a4a4a',size:5,every:17}),p('dapple',{clip:rect(.12,.76,.62,1),count:16,size:22}),
      p('petal',{clip:rect(.2,.02,.95,.62),count:16,palette:BLOSSOM}),
      p('butterflies',{count:3,clip:rect(.3,.3,.9,.62),size:14}),
      p('water',{clip:[[0.43,0.51],[0.75,0.51],[0.82,0.63],[0.35,0.70]],glint:'#ffffff',ripples:4,glints:36})]],
    ['easter','Easter','The Secret Spring Garden','holiday',[
      p('dapple',{clip:rect(.45,.72,.95,1),count:18,size:26}),p('birds',{clip:rect(.5,.05,.8,.25),color:'#4a4a4a',size:4,every:19}),
      p('petal',{clip:rect(.20,.02,.94,.62),count:16,palette:BLOSSOM}),
      p('butterflies',{count:4,clip:rect(.38,.29,.88,.69)}),
      sprite('sprite-rabbit',[.715,.773],.045)]],
    ['earth-day','Earth Day','The Reclaimed World','holiday',[
      p('steam',{at:[.101,.573],width:.024,size:.7}),p('dapple',{clip:rect(.35,.66,.95,.95),count:14,size:24}),
      p('beams',{clip:rect(.3,0,.85,.75),count:4,angle:.25,width:55,strength:.1}),
      p('mote',{clip:rect(.3,.1,.85,.7),count:18,color:'#fff2c8'}),
      p('leaf',{count:10,clip:rect(.22,0,.83,.7),palette:['#6f9a3a','#8fb24a','#4f7a2a','#b3c25a']}),
      p('water',{clip:[[0.37,0.66],[0.69,0.65],[0.91,0.92],[0.54,0.92]],glint:'#f2ffe8',ripples:5}),
      lamps([[.195,.19,45]])]],
    ['ramadan','Ramadan','The Courtyard After Sunset','holiday',[
      p('firefly',{count:8,clip:rect(.45,.42,.9,.58),color:'#ffe9a0'}),p('steam',{at:[.347,.637],width:.006,size:.5}),p('moths',{anchors:[[.096,.12]]}),
      p('stars',{clip:rect(.42,0,.95,.17),count:14,every:31}),
      p('water',{clip:[[0.48,0.58],[0.85,0.58],[0.88,0.66],[0.48,0.63]],glint:'#ffcf8a'}),
      lamps([[.096,.10,60],[.957,.72,60],[.50,.375,25],[.61,.385,25]])]],
    ['eid','Eid al-Fitr','The Welcoming House','holiday',[
      p('moths',{anchors:[[.383,.39],[.686,.39]]}),
      p('stars',{clip:rect(.45,0,.75,.18),count:10,shooting:false}),
      p('sparkle',{clip:rect(.32,0,.62,.42),count:18,color:'#ffe2a0',size:.8}),
      p('firefly',{count:10,clip:[[0.3,0.12],[0.75,0.12],[0.75,0.65],[0.3,0.65]],color:'#ffe08a'}),
      lamps([[.093,.09,60],[.973,.095,60],[.383,.39,38],[.686,.39,38],[.466,.39,22],[.577,.39,22]])]],
    ['midsummer','Summer Solstice / Midsummer','The Endless Evening','holiday',[
      p('steam',{at:[.066,.726],width:.036}),p('fire',{at:[.862,.676],width:.032,height:.065,smoke:110}),
      p('birds',{clip:rect(.45,.02,.95,.3),color:'#2a2230',size:5,every:19}),
      p('water',{clip:[[0.4,0.42],[0.94,0.42],[0.94,0.58],[0.4,0.58]],glint:'#fff0b8',glints:44,ripples:4}),
      p('mote',{clip:rect(.35,.1,.95,.6),count:14,color:'#fff2c0'}),
      p('firefly',{count:10,clip:[[0.35,0.4],[0.95,0.4],[0.95,0.7],[0.35,0.7]]}),
      lamps([[.015,.10,40]])]],
    ['saint-jean','Saint-Jean-Baptiste','The Lakeside Gathering','holiday',[
      p('steam',{at:[.079,.733],width:.036}),p('moths',{anchors:[[.135,.15]]}),
      p('stars',{clip:rect(.5,0,1,.18),count:10,shooting:false}),
      p('fireworks',{clip:rect(.55,.03,.98,.27),palette:['#3b7bff','#ffffff','#8fb8ff','#5fa0ff'],size:70,every:4.6,density:.65}),
      p('firefly',{count:14,clip:rect(.51,.35,.8,.61)}),
      p('water',{clip:rect(.50,.37,.95,.58),glint:'#ffd7a8'}),
      p('fire',{at:[.722,.663],width:.04,height:.08,smoke:120}),
      lamps([[.135,.15,55],[.21,.38,22]])]],
    ['national-day','Canada Day / National Holiday','The Waterfront Pavilion','holiday',[
      p('boat',{clip:rect(.62,.4,.92,.52),at:[0,.478],size:7,period:300}),p('moths',{anchors:[[.11,.13]]}),
      p('birds',{clip:rect(.4,.05,.9,.35),color:'#3b3040',size:6,every:21}),
      p('fireworks',{clip:rect(.32,.04,.88,.36),palette:['#ff3b4a','#ffffff','#ff6b6b','#ffd6d6'],size:95}),
      p('water',{clip:rect(.43,.52,.80,.70),glint:'#ffd6a0',glints:40}),
      lamps([[.11,.13,60],[.878,.80,40]])]],
    ['harvest','Thanksgiving / Harvest','The Harvest Cottage','holiday',[
      p('leaf',{count:16,clip:rect(.452,0,.99,.48),palette:AUTUMN}),
      p('steam',{at:[.654,.623],width:.034}),
      p('fire',{at:[.064,.70],width:.075,height:.1}),
      lamps([[.238,.106,50]])]],
    ['halloween','Halloween','The Witch’s Reading Room','holiday',[
      p('steam',{at:[.091,.607],width:.026}),
      lamps([[.61,.14,60]],{color:'#dfe8ff',strength:.16,rate:.5}),
      p('birds',{kind:'bat',clip:rect(.43,.02,.73,.5),every:13,size:16,chance:.8,band:[.18,.32],color:'#07060a',layer:'outside'}),
      p('mist',{clip:rect(.43,.3,.73,.53),color:'#a9b8d6',strength:.22,size:60,layer:'outside'}),
      p('firefly',{count:6,color:'#b0e9b9',clip:rect(.45,.1,.8,.51),layer:'outside'}),
      p('cauldron',{at:[.798,.61]}),
      sprite('sprite-cat',[.542,.816],.095),
      lamps([[.365,.27,45],[.79,.16,50],[.03,.37,60],[.718,.47,30]])]],
    ['dia-de-muertos','Día de Muertos','The Marigold Courtyard','holiday',[
      p('steam',{at:[.962,.640],width:.038}),p('fountain',{at:[.763,.418],width:.014,fall:.045}),p('fountain',{at:[.763,.478],width:.032,fall:.04}),p('water',{clip:rect(.67,.53,.84,.57),ripples:4,glints:8}),
      p('mote',{clip:rect(.4,.25,.75,.6),count:12,color:'#ffc070'}),
      p('petal',{count:16,clip:[[0.22,0.1],[0.95,0.1],[0.95,0.8],[0.22,0.8]],palette:['#f59a1c','#f7b733','#e46a12','#c2185b']}),
      p('water',{clip:rect(.70,.5,.82,.6),ripples:3,glints:10}),
      lamps([[.24,.22,55],[.889,.24,55],[.41,.35,25],[.55,.35,25],[.694,.35,25]])]],
    ['diwali','Diwali','The House of Little Lights','holiday',[
      p('smoke',{at:[.533,.716],strength:.1,height:60,strands:1}),p('smoke',{at:[.651,.721],strength:.1,height:60,strands:1}),
      p('fireworks',{clip:rect(.42,.02,.88,.27),palette:['#ffb627','#ff5d8f','#7cf29a','#ffd76e','#c084fc'],size:72}),
      p('mote',{clip:rect(.3,.35,.85,.75),count:12,color:'#ffcf7a'}),
      p('flames',{anchors:[[.373,.82],[.379,.78],[.448,.743],[.533,.729],[.651,.734],[.747,.752],[.808,.795],[.804,.839],[.657,.885],[.502,.88]],height:.013}),
      lamps([[.164,.09,65],[.92,.34,30]])]],
    ['hanukkah','Hanukkah','The Window of Lights','holiday',[
      p('steam',{at:[.731,.512],width:.036}),
      p('stars',{clip:rect(.55,0,.98,.1),count:8,shooting:false}),
      p('snow',{clip:rect(.53,.01,1,.47),count:56,layer:'outside'}),
      p('water',{clip:rect(.56,.37,.92,.47),glint:'#ffd890',ripples:0,glints:22,layer:'outside'}),
      p('flames',{anchors:[[.568,.369],[.581,.369],[.592,.369],[.605,.369],[.618,.353],[.632,.366],[.644,.368],[.657,.365],[.670,.365]],height:.012}),
      lamps([[.257,.14,75]])]],
    ['christmas','Christmas','The Christmas Eve Library','holiday',[
      p('snow',{clip:rect(.40,0,.83,.385),count:80,layer:'outside'}),
      p('sparkle',{clip:[[0,0],[.09,0],[.17,.75],[0,.8]],count:26,color:'#ffd27a',size:.9}),
      p('steam',{at:[.207,.600],width:.028}),
      p('fire',{at:[.966,.665],width:.056,height:.1}),
      sprite('sprite-cat',[.235,.933],.13),
      lamps([[.364,.18,45],[.848,.085,45],[.371,.37,30]])]],
    ['winter-solstice','Winter Solstice','The Longest Night','holiday',[
      p('stars',{clip:rect(.33,0,.76,.36),count:20,every:21}),
      p('aurora',{clip:rect(.38,0,.76,.36)}),
      p('snow',{clip:rect(.17,0,.77,.68),count:56,layer:'outside'}),
      p('steam',{at:[.070,.680],width:.048}),
      p('fire',{at:[.966,.662],width:.056,height:.1}),
      lamps([[.108,.19,50]])]],
    ['rainy-bookshop','Make Yourself at Home','The Rainy Bookshop','achievement',[
      p('rain',{count:90,clip:rect(.423,.003,.711,.453),glass:12,slant:0,spread:.5,vp:.5,layer:'outside'}),
      p('rain',{count:20,clip:rect(.77,.04,.866,.423),glass:4,slant:.08,layer:'outside'}),
      p('water',{clip:rect(.51,.37,.70,.45),ripples:9,glints:12,glint:'#ffd9a0'}),
      p('steam',{at:[.085,.556],width:.035}),
      lamps([[.67,.133,40],[.78,.24,25],[.093,.32,60],[.374,.12,35],[.948,.064,40]])],
      {metric:'activeSeconds',value:3600,label:'1 hour of reading or listening'}],
    ['midnight-express','One More Chapter','The Midnight Express','achievement',[
      p('stars',{clip:rect(.25,.02,.83,.25),count:18}),
      p('train',{clip:rect(.245,.30,.83,.56),band:[.35,.6],layer:'outside'}),
      p('snow',{clip:rect(.245,.02,.83,.57),count:40,wind:-30,layer:'outside'}),
      p('steam',{at:[.847,.582],width:.052}),
      lamps([[.117,.15,55]])],
      {metric:'completedBooks',value:1,label:'Finish your first book'}],
    ['fox-retreat','A Familiar Place','The Fox’s Retreat','achievement',[
      p('moths',{anchors:[[.25,.19]]}),
      p('stars',{clip:rect(.7,0,.97,.22),count:10,shooting:false}),
      p('water',{clip:rect(.79,.45,.96,.52),ripples:0,glints:14,glint:'#ffd0a0'}),
      p('firefly',{count:14,clip:rect(.46,.41,.95,.70)}),
      sprite('sprite-fox',[.79,.704],.10),
      p('steam',{at:[.392,.742],width:.038}),
      lamps([[.25,.19,45],[.643,.49,35],[.045,.33,40]])],
      {metric:'distinctReadingDays',value:7,label:'Read on 7 different days'}],
    ['tidal-library','Finding Your Rhythm','The Tidal Library','achievement',[
      p('boat',{clip:rect(.37,.3,.69,.36),at:[0,.338],size:8,period:300,layer:'outside'}),p('steam',{at:[.023,.643],width:.032}),p('dapple',{clip:rect(.3,.72,.9,1),count:12,size:28,strength:.12}),
      p('birds',{clip:rect(.37,.04,.7,.32),color:'#5a6470',size:6,every:15}),
      p('water',{clip:rect(.37,.35,.69,.64),ripples:0,glints:50,glint:'#ffffff',layer:'outside'}),
      lamps([[.066,.14,40]])],
      {metric:'activeSeconds',value:18000,label:'5 hours of reading or listening'}],
    ['glasshouse','Room to Grow','The Glasshouse','achievement',[
      p('steam',{at:[.109,.688],width:.03}),p('dapple',{clip:rect(.3,.7,.95,1),count:20,size:28}),
      p('beams',{clip:rect(.25,0,.95,.85),count:5,angle:.3,width:50,strength:.12}),
      p('mote',{clip:rect(.3,.15,.9,.75),count:20}),
      p('butterflies',{count:5,clip:rect(.30,.30,.81,.67)}),
      p('water',{clip:[[.61,.678],[.78,.678],[.80,.711],[.64,.714]],ripples:3,glints:10}),
      lamps([[.11,.15,40],[.86,.22,40]])],
      {metric:'completedBooks',value:3,label:'Finish 3 books'}],
    ['observatory','A Wider World','The Snowbound Observatory','achievement',[
      p('mist',{clip:rect(.35,.36,.87,.5),color:'#c8d6ee',strength:.15,size:80,layer:'outside'}),p('mote',{clip:rect(0,0,.3,.45),count:10,color:'#ffe0b0'}),
      p('stars',{clip:rect(.35,0,.87,.38),count:30,every:17}),
      p('aurora',{clip:rect(.37,.015,.63,.335)}),
      lamps([[.02,.06,40],[.236,.19,40],[.974,.22,40],[.398,.64,35]])],
      {metric:'activeSeconds',value:36000,label:'10 hours of reading or listening'}],
    ['lantern-garden','Little Rituals','The Lantern Garden','achievement',[
      lamps([[.41,.115,45]],{color:'#e6efff',strength:.15,rate:.5}),
      p('leaf',{count:10,clip:rect(.6,0,1,.6),palette:MAPLE}),
      p('water',{clip:[[.30,.47],[.62,.47],[.85,.55],[.85,.72],[.40,.72],[.30,.60]],ripples:5}),
      p('fish',{count:4,clip:[[.30,.47],[.62,.47],[.85,.55],[.85,.72],[.40,.72],[.30,.60]]}),
      p('firefly',{count:6,clip:rect(.3,.3,.9,.6)}),
      p('steam',{at:[.473,.718],width:.06}),
      lamps([[.2,.44,35],[.89,.45,30]])],
      {metric:'distinctReadingDays',value:15,label:'Read on 15 different days'}],
    ['sunken-archive','Beneath the Surface','The Sunken Archive','achievement',[
      p('beams',{clip:rect(.25,0,.85,.65),count:6,angle:.1,width:45,color:'#9fdcff',strength:.12}),
      p('mote',{count:20,color:'#bfe8ff',clip:rect(.22,.05,.88,.62)}),
      p('fish',{count:7,color:'#2f5f72',size:18,clip:rect(.22,.05,.88,.62),layer:'outside'}),
      p('bubbles',{count:14,clip:rect(.22,.05,.88,.62),layer:'outside'}),
      lamps([[.153,.21,45],[.906,.22,45]])],
      {metric:'activeSeconds',value:90000,label:'25 hours of reading or listening'}],
    ['last-bloom','Stories Take Root','The Last Bloom','achievement',[
      p('beams',{clip:rect(.4,0,1,.8),count:4,angle:-.3,width:55,color:'#ffe6b8',strength:.1}),
      p('mote',{clip:rect(.3,.2,.95,.7),count:16,color:'#ffe0a0'}),
      p('petal',{clip:rect(.05,.02,.7,.7),count:18,palette:BLOSSOM}),
      sprite('sprite-robot',[.65,.79],.055,{path:[[.61,.79],[.77,.79]],period:95,visit:25}),
      p('water',{clip:[[.68,.685],[.98,.691],[.98,.74],[.73,.724]]})],
      {metric:'completedBooks',value:10,label:'Finish 10 books'}],
    ['orbital-room','Far From Home','The Orbital Reading Room','achievement',[
      p('steam',{at:[.097,.634],width:.034}),p('satellite',{clip:rect(.37,0,.92,.13)}),
      p('stars',{clip:rect(.37,0,.92,.14),count:18,shooting:false}),
      p('water',{clip:rect(.75,.35,.92,.55),ripples:0,glints:20,glint:'#fff3d6',layer:'outside'}),
      p('crane',{at:[.82,.19]}),
      lamps([[.147,.18,40]])],
      {metric:'activeSeconds',value:180000,label:'50 hours of reading or listening'}],
    ['origami-valley','A Thousand Folds','The Origami Valley','achievement',[
      p('crane',{at:[.33,.18],scale:1.1,phase:3}),p('crane',{at:[.78,.12],scale:.9,phase:7}),p('crane',{at:[.59,.25]}),
      p('water',{clip:[[.30,.58],[.75,.58],[.93,.94],[.45,.94]],glint:'#ffd9a8'}),
      p('mote',{count:10,color:'#e0c89b'}),
      lamps([[.137,.51,40],[.32,.47,20],[.73,.47,20],[.91,.50,25],[.92,.33,20]])],
      {metric:'distinctReadingDays',value:30,label:'Read on 30 different days'}],
    ['impossible-library','Between Worlds','The Impossible Library','achievement',[
      p('steam',{at:[.229,.541],width:.028}),
      p('birds',{clip:rect(.48,.03,.73,.3),color:'#4a4050',size:5,every:17}),
      p('mist',{clip:rect(.26,.45,.73,.72),color:'#fff1e6',strength:.22,size:90}),
      p('book',{at:[.72,.33]}),p('book',{at:[.52,.58],scale:1.2,phase:2.5}),
      p('mote',{count:18}),
      lamps([[.132,.13,40],[.909,.21,40],[.272,.10,25]])],
      {metric:'activeSeconds',value:360000,label:'100 hours of reading or listening'}]
  ];
  // Generated by tools/build-scene-data.cjs; optional, so the catalog still works without it.
  const data = window.OrigamiSceneData || {}, url = path => path && new URL(path, root).href;
  const extras = id => {
    const d = data[id]; if (!d) return {};
    return {
      masks: {sky: url(d.sky), outside: url(d.outside)}, ambient: d.ambient,
      drift: d.drift && d.skyfill ? {...d.drift, mask: url(d.drift.mask), skyfill: url(d.skyfill.src), box: d.skyfill.box} : null
    };
  };
  window.OrigamiScenes = Object.freeze(rows.map(([id,event,title,category,effects,unlock],index) => Object.freeze({
    id,event,title,category,effects,image:new URL(`assets/${id}.png`,root).href,...extras(id),
    sourceWidth:1672,sourceHeight:941,
    unlock: unlock || {metric:'holidaySeconds',value:1200,holidayId:id,fallbackSeconds:(30+index*2)*3600,label:'Read or listen for 20 minutes during this celebration'},
    // Animation masks and anchors are intentionally data, so a host can tune them.
  })));
})();
