// Each cutout has a wide placement (x, y, width, rotation) and a portrait placement [x, y, width], measured in percentages.
const series = [
  {key:'B', title:'暗房印样', looks:['奶油针织','棕色外套'], fold:'@ivory-shirt', pieces:[
    ['proofs','连衣裙与红针织街拍',13,21,12,-6,[21,15,25]],
    ['@knit-sample','带纽扣的酒红针织布样',6,41,11,-10,[6,43,15]],
    ['knit','奶油色针织布样',69,48,12,-7,[75,37,23]],
    ['@white-look','白衬衫街拍',72,40,13,2,[77,42,24]],
    ['@ivory-shirt','象牙白衬衫',85,48,20,6,[82,59,29]],
    ['navy','藏蓝针织街拍',12,69,13,-5,[14,69,21]],
    ['linen','红线亚麻布样',5,89,11,-5,[6,85,16]],
    ['floral','碎花裙街拍',24,83,15,3,[31,82,25]],
    ['jeans','蓝色牛仔裤',35,84,10,3,[46,85,17]],
    ['looks/cream-knit','奶油色圆领针织衫',50,74,14,-6,[63,69,24]],
    ['looks/suede-shirt','棕色单胸袋短外套',60,88,13,4,[66,91,25]],
    ['trench','风衣红围巾街拍',73,80,16,-2,[83,79,23]],
    ['sitting','黑色背心坐姿街拍',86,87,10,6,[92,89,13]]
  ]},
  {key:'D', title:'缝线长卷', reverse:true, looks:['雾蓝衬衫','象牙白开衫'], pieces:[
    ['swatch-look','雾蓝衬衫侧身照和布样',92,24,14,5,[89,14,20]],['looks/solid-blue-shirt','雾蓝色卷袖衬衫',90,65,15,5,[90,74,24]],
    ['@stripe-sample','蓝色条纹布样',8,17,11,-3,[18,9,17]],['B-jeans','牛仔裤',11,43,10,-5,[15,36,21]],
    ['B-floral','碎花裙街拍',25,42,12,2,[22,52,24]],['cream-sample','奶白针织布样',35,51,12,8,[10,62,17]],
    ['@blue-look','蓝衬衫配白裤街拍',38,74,13,-2,[35,74,24]],['looks/ivory-trousers','米白色褶裥长裤',24,78,14,-4,[19,83,21]],
    ['stairs','台阶上的奶油色穿搭',11,76,11,-4,[9,70,15]],['denimswatch','牛仔样布',7,90,7,5,[8,93,11]],
    ['linen-look','白衬衫桌边坐姿街拍',75,83,13,4,[68,83,23]],['landscape','阳光下的蓝衬衫横幅印相',59,94,24,4,[58,94,32]]
  ]},
  {key:'E', title:'漂浮服装展', portrait:'E-soft', looks:['米白背心','酒红开衫'], pieces:[
    ['beige-look','米色外套全身街拍',10,22,8,-4,[15,13,17]],['looks/ivory-tank','米白色宽肩带背心',14,32,8,2,[27,16,17]],
    ['dresslook','浅色长裙街拍',87,17,8,4,[85,12,15]],['coat','卡其风衣',95,34,10,6,[91,27,18]],
    ['checks','格纹布样',4,50,7,-7,[6,32,13]],['pants','靛蓝长裤',11,61,10,-3,[10,55,16]],
    ['cream-skirt','象牙色长裙',18,72,9,1,[13,68,19]],['looks/red-cardigan','酒红色圆领开衫',71,41,18,5,[79,44,28]],
    ['@cover-print','奶油色裙装街拍',60,44,9,-6,[70,29,14]],['@mini-look','红开衫坐姿街拍',80,54,10,-5,[81,61,18]],
    ['jacket-look','浅外套配短裙街拍',89,56,7,4,[87,73,15]],['walklook','白上衣牛仔裤街拍',96,60,6,4,[95,55,11]],
    ['rib','酒红针织罗纹细节',8,83,15,-5,[9,85,23]],['ivory-look','白裙街拍',22,90,7,-5,[23,90,12]],
    ['black-look','黑裙街拍',32,84,11,-4,[35,77,19]],['blue-skirt','冰蓝衬衫',44,84,9,2,[49,80,17]],
    ['beigetop','米白上衣',37,95,7,-5,[34,95,15]],['@skirt','黑色半裙',53,88,9,3,[61,88,16]],
    ['tiny-look','短裙街拍',61,91,6,3,[53,96,10]],['@ivory-collar','象牙白领口特写',73,79,17,0,[69,70,23]],
    ['denim-corner','深蓝牛仔裤袋细节',88,88,18,4,[85,90,26]]
  ]},
  {key:'A', title:'造型师工作桌', reverse:true, portrait:'A-set', fullLook:true, looks:['米白衬衫＋卡其直筒裤','砖红针织＋深灰阔腿裤'], pieces:[
    ['tree','树影印相',6,12,10,-8,[11,9,16]],['alley','街巷小照',12,18,6,4,[25,9,11]],
    ['botanical','枝叶印相',7,58,11,-9,[6,27,13]],['B-trench','风衣红围巾街拍',21,41,12,4,[22,34,24]],
    ['M2-trousers','卡其直筒裤',33,48,13,-3,[30,52,23]],['ivory','米白褶裥衬衫',47,36,13,-7,[11,55,21]],
    ['stationery','植物印相与纸夹',91,19,11,5,[79,11,19]],['sketch','造型手绘纸页',96,29,6,-4,[91,15,12]],
    ['@blouse-look','白衬衫造型照',48,56,11,2,[83,70,21]],
    ['red-sample','红色针织样布',13,83,9,-6,[5,71,14]],['looks/red-cardigan','酒红色圆领开衫',24,78,13,-6,[21,77,25]],
    ['red-look','酒红针织坐姿街拍',36,80,13,1,[40,72,23]],
    ['longcoat','深棕大衣街拍',50,86,11,-6,[45,84,17]],['M5-grey','灰色西裤',94,56,8,6,[61,89,14]],
    ['@wool-sample','棕色羊毛布样',73,85,9,3,[74,91,15]],['brown-look','大衣围巾街拍',84,82,13,3,[87,85,22]],
    ['thread','暖色线轴',5,88,6,-3,[9,91,12]],['leaf','树叶相片',93,92,7,8,[45,97,13]]
  ]},
  {key:'C', title:'透明叠片', portrait:'C-set', fullLook:true, looks:['浅蓝衬衫＋米色风衣＋藏青长裤','奶油针织＋棕色短外套＋深色半裙'], pieces:[
    ['stripecorner','蓝白条纹面料',97,15,12,8,[95,10,20]],['sky','天空树影小照',86,14,8,-6,[77,14,18]],
    ['knitcorner','绞花针织细节',6,23,13,-7,[12,13,24]],['knitsnap','针织领口印相',92,47,10,6,[91,41,15]],
    ['blouse','蓝条纹衬衫',77,44,14,4,[79,34,23]],['looks/rib-knit','奶油色细罗纹针织衫',61,44,14,-3,[76,52,24]],
    ['looks/zip-jacket','棕色翻领拉链短外套',56,61,12,-4,[88,65,19]],['flower','树影试印',94,72,7,9,[93,82,12]],
    ['navy-look','牛仔外套街拍',81,77,14,4,[77,84,24]],['@street-look','白色针织全身街拍',63,79,14,1,[56,75,22]],
    ['looks/trench','米色双排扣风衣',49,86,12,-5,[33,84,18]],['M5-navy','藏青长裤',9,56,8,4,[50,91,14]],
    ['knitdetail','米色毛线细节',23,92,10,-2,[26,94,15]],['@stripe','条纹袖口',14,82,10,-2,[13,68,19]],
    ['bluecloth','蓝白棉布',6,90,8,-6,[8,86,16]]
  ]},
  {key:'M1', group:'男士', reverse:true, title:'城市通勤', looks:['浅蓝衬衫','藏青西装'], pieces:[
    ['rain','雨天通勤街拍',7,26,11,-5,[18,8,15]],['street','街边的西装侧影',91,14,9,4,[88,12,15]],
    ['looks/office-shirt','浅蓝色长袖衬衫',21,47,17,-5,[16,52,25]],['wool','藏青西装面料',35,39,9,4,[33,39,12]],
    ['trousers','炭灰西裤',40,62,12,3,[30,69,18]],['crossing','路口的人物印相',21,80,13,-3,[14,83,18]],
    ['weave','灰色粗纺布样',5,77,10,4,[5,66,12]],['corner','风衣与衬衫街拍',91,65,13,2,[85,78,18]],
    ['detail','西装驳领细节',72,88,19,-7,[66,88,24]],
    ['suit','藏青双扣西装平铺',43,83,13,4,[37,86,17]] ]},
  {key:'M2', group:'男士', title:'周末慢调', looks:['米白针织','靛蓝牛仔衬衫'], pieces:[
    ['walk','阳光下的周末街拍',9,23,11,-4,[11,17,15]],['tote','背着帆布包的街头背影',90,14,10,5,[86,14,15]],
    ['books','书店翻书造型照',60,47,13,-4,[72,45,19]],['looks/denim-shirt','单胸袋牛仔衬衫',76,52,17,5,[87,59,22]],
    ['sun','浅色外搭街拍',91,67,12,4,[87,76,16]],['trousers','沙色休闲裤',13,67,10,6,[10,66,14]],
    ['checks','格纹棉布',4,48,8,-5,[5,40,12]],['denim','水洗牛仔布样',58,83,13,6,[61,81,18]],
    ['detail','米白针织纹理',30,87,16,-6,[27,87,22]],
    ['pullover','米白圆领针织衫',72,76,14,-5,[47,73,18]] ]},
  {key:'M3', group:'男士', reverse:true, title:'山野轻行', looks:['沙色工装衬衫','橄榄绿风衣'], pieces:[
    ['prints','林间步行的三张穿搭印相',20,43,25,-2,[18,40,38]],['cloth','工装棉布与防风面料',91,25,13,-5,[87,14,15]],
    ['shell','橄榄绿连帽风衣',12,76,19,-5,[14,68,26]],['trousers','石墨色徒步长裤',35,73,10,3,[35,79,18]],
    ['detail','沙色衬衫口袋细节',85,80,15,6,[80,82,23]],['walk','林道穿搭印相',57,85,11,-4,[57,89,17]],
    ['looks/khaki-overshirt','沙色单胸袋工装衬衫',43,47,14,5,[32,61,17]],['trail','山道上的工装衬衫侧影',8,20,10,-4,[42,7,14]] ]},
  {key:'M4', group:'男士', title:'午后画室', fullLook:true, looks:['米白针织 Polo＋靛蓝牛仔裤','陶土色衬衫＋米白休闲裤'], pieces:[
    ['print-a','针织与原色牛仔造型照',9,21,10,-6,[10,14,17]],['polo','米白短袖针织 Polo',68,42,15,-5,[74,38,19]],
    ['jeans','靛蓝直筒牛仔裤',87,48,10,6,[88,55,16]],['M2-denim','靛蓝牛仔布样',6,55,9,-6,[6,50,11]],
    ['shirt','陶土色衬衫平铺',14,81,15,3,[12,83,21]],['detail','陶土色衬衫衣料细节',40,90,10,-3,[34,90,17]],
    ['chinos','米白休闲裤',56,77,10,5,[61,78,17]],['print-b','陶土色衬衫的全身造型',78,77,13,5,[83,81,18]],
    ['studio','穿针织 Polo 挂画的侧影',86,19,12,4,[84,9,16]] ]},
  {key:'M5', group:'男士', reverse:true, title:'暮色街角', fullLook:true, looks:['白色T恤＋驼色风衣＋藏青长裤','浅灰针织＋炭灰西装＋灰色西裤'], pieces:[
    ['print-a','长风衣与藏青长裤造型照',8,24,11,-6,[14,31,15]],['coat','驼色长风衣',21,53,14,-5,[17,52,22]],
    ['navy','藏青长裤',38,63,10,4,[32,68,17]],['M1-wool','西装斜纹布样',39,35,8,3,[35,33,11]],
    ['blazer','炭灰西装外套',13,82,14,-3,[13,84,21]],['grey','灰色羊毛西裤',94,24,8,5,[91,16,12]],
    ['print-b','浅灰针织与西装造型照',90,73,12,-4,[87,80,18]],['detail','驼色风衣领口',50,87,13,5,[61,90,18]],
    ['dusk','街角回身的灰西装造型',32,85,11,-5,[36,86,16]] ]},
  {key:'K1', group:'童装', title:'上学路上', looks:['雾蓝衬衫','奶黄针织开衫'], pieces:[
    ['way','背着书包走向学校',8,31,11,-3,[7,20,13]],['blossom','女孩看向树梢的小照',91,20,12,3,[87,8,14]],
    ['shirt','折好的雾蓝衬衫',60,44,15,-3,[76,40,23]],['khaki','卡其色儿童长裤',82,54,13,3,[88,58,19]],
    ['knit','奶黄色针织布样',57,64,9,-5,[69,63,13]],['gate','上学路上的侧影',65,83,14,2,[62,82,21]],
    ['blue','雾蓝色棉布细节',7,80,15,-6,[10,79,21]],['cuff','浅黄色针织袖口',92,83,13,5,[91,85,18]],
    ['looks/kids-cardigan','奶黄色圆领童装开衫',37,81,13,5,[37,83,18]] ]},
  {key:'K2', group:'童装', reverse:true, title:'操场放学', looks:['灰白卫衣','海军蓝棒球夹克'], pieces:[
    ['grey','浅灰卫衣棉布',7,14,9,-4,[14,9,13]],['looks/varsity','海军蓝条纹领棒球夹克',13,45,17,-3,[15,42,24]],
    ['run','男孩跑过操场',30,40,13,3,[33,54,17]],['rib','条纹罗纹袖口',44,55,9,-3,[12,63,13]],
    ['track','放学时经过跑道的背影',12,76,11,-4,[11,81,16]],['joggers','灰色束脚运动裤',28,78,11,3,[32,80,17]],
    ['rest','看台边抱球休息的小照',48,82,14,2,[59,88,20]],
    ['sweatshirt','灰白圆领卫衣平铺',41,66,13,5,[24,67,18]],['court','灰白卫衣运球侧影',82,80,12,-3,[83,81,16]] ]},
  {key:'K3', group:'童装', title:'公园写生', looks:['红白条纹衫','鼠尾草绿外搭'], pieces:[
    ['path','女孩沿着公园小径走',7,29,10,-4,[7,20,14]],['leaf','一张树叶铅笔速写',93,15,10,3,[88,9,14]],
    ['bookprints','写生与散步的两张小照',62,47,19,2,[76,39,25]],['looks/sage-kids','鼠尾草绿单胸袋外搭',87,50,18,3,[88,59,23]],
    ['stripes','红白条纹面料',6,76,13,-4,[10,78,17]],['denim','叠放的儿童牛仔裤',58,80,13,3,[58,82,18]],
    ['cuff','红白条纹袖口',80,80,10,-3,[82,83,15]],['looks/breton','红白细条纹长袖衫',31,82,13,3,[36,83,18]] ]},
  {key:'K4', group:'童装', reverse:true, fullLook:true, title:'周末出游', looks:['米白 Polo＋靛蓝牛仔裤','橘色 T 恤＋沙色工装裤'], pieces:[
    ['print-a','周末小径上的全身穿搭',8,25,11,-5,[13,31,16]],['polo','童装米白 Polo',22,49,15,-4,[16,50,21]],
    ['jeans','儿童靛蓝直筒牛仔裤',42,53,10,4,[33,64,16]],['tee','橘色短袖 T 恤',12,80,14,4,[13,82,21]],
    ['cargo','沙色口袋工装裤',34,82,10,-3,[37,86,16]],['print-b','橘色上衣搭配工装裤的造型照',93,45,9,5,[89,12,15]],
    ['detail','米白 Polo 针织领细节',55,88,12,4,[65,89,19]],
    ['creek','穿橘色上衣在溪边捡石子的男孩',76,85,12,-4,[84,82,16]] ]},
  {key:'K5', group:'童装', fullLook:true, title:'秋日散步', looks:['浅蓝衬衫＋驼色风衣＋藏青长裤','奶油针织＋砖红短外套＋格纹半裙'], pieces:[
    ['print-a','女孩拿着落叶的全身造型',9,22,10,-4,[9,14,14]],['coat','驼色儿童风衣',63,47,14,-4,[74,40,20]],
    ['blouse','童装浅蓝衬衫',84,40,12,3,[88,53,17]],['looks/k5-jacket','砖红灯芯绒短外套',11,77,13,4,[10,78,19]],
    ['looks/k5-skirt','格纹百褶半裙',58,78,13,-4,[58,78,17]],['print-b','秋日小径上的格裙造型',79,80,12,3,[81,82,19]],
    ['detail','风衣与衬衫的叠穿细节',36,90,10,-2,[34,91,16]],
    ['leaves','穿风衣走过落叶小径的女孩',88,16,11,5,[86,9,16]] ]}
];

const garments = new Set([
  '@ivory-shirt', 'jeans', 'pleats', 'cardigan', 'B-pleats', 'ivory',
  '@red-knit', 'coat', '@shirt', 'B-jeans', 'trousers', 'blouse', 'cable',
  'overshirt', 'tank', 'pants', 'cream-skirt', 'B-cardigan', 'blue-skirt',
  'beigetop', '@skirt', 'E-coat', 'M1-shirt', 'M1-trousers', 'M2-shirt',
  'M2-trousers', 'M3-shell', 'M3-trousers', 'M4-polo', 'M4-shirt', 'M4-jeans',
  'M4-chinos', 'M5-coat', 'M5-blazer', 'M5-navy', 'M5-grey',
  'K1-shirt', 'K1-khaki', 'K2-jacket', 'K2-joggers', 'K3-shirt', 'K3-denim',
  'K4-polo', 'K4-jeans', 'K4-tee', 'K4-cargo', 'K5-coat', 'K5-blouse', 'K5-jacket', 'K5-skirt',
  'M1-suit', 'M2-pullover', 'M3-utility', 'K1-cardi', 'K2-sweatshirt', 'K3-breton'
]);

const swatches = new Set([
  '@knit-sample', 'knit', 'linen', 'red-sample', '@wool-sample',
  '@stripe-sample', 'cream-sample', 'denimswatch', 'stripecorner',
  'knitcorner', '@denim', 'knitdetail', '@stripe', 'bluecloth',
  'checks', 'rib', '@ivory-collar', 'denim-corner', 'M1-wool', 'M1-weave',
  'M2-checks', 'M2-denim', 'M3-cloth', 'K1-knit', 'K1-blue', 'K1-cuff',
  'K2-grey', 'K2-rib', 'K3-stripes', 'K3-cuff'
]);

const stories = document.querySelector('#stories');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function enableComparisonSwipe(stage, pair, range) {
  let drag = null;

  function setSplit(percent) {
    const value = Math.round(Math.max(0, Math.min(100, percent)));
    if (value === range.valueAsNumber) return;
    range.valueAsNumber = value;
    range.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function finish() {
    if (!drag) return;
    const {id, initial} = drag;
    drag = null;
    if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    if (range.valueAsNumber !== initial) range.dispatchEvent(new Event('change', {bubbles:true}));
  }

  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { finish(); return; }
    if (event.button !== 0 || event.target.closest('button, a')) return;
    const onImage = pair.contains(event.target);
    const touch = event.pointerType === 'touch';
    if (!touch && !onImage) return;
    const initial = range.valueAsNumber;
    const width = pair.clientWidth;
    const tap = onImage ? event.offsetX * 100 / width : null;
    drag = {id:event.pointerId, startX:event.clientX, startY:event.clientY, lastX:event.clientX,
      initial, position:touch ? initial : tap, tap, width, onImage, horizontal:!touch};
    stage.setPointerCapture(event.pointerId);
    if (!touch) {
      event.preventDefault();
      range.focus({preventScroll:true});
      setSplit(tap);
    }
  });

  function move(event) {
    if (event.pointerId !== drag?.id) return;
    if (!drag.horizontal) {
      const dx = Math.abs(event.clientX - drag.startX);
      const dy = Math.abs(event.clientY - drag.startY);
      if (Math.max(dx, dy) < 6) return;
      // Inside the portrait, even a vertical start can turn into a comparison drag.
      if (!drag.onImage && dy >= dx) { finish(); return; }
      drag.horizontal = true;
    }
    // Keep fractional travel between events and respond immediately when reversing at an edge.
    const delta = (event.clientX - drag.lastX) * 100 / drag.width;
    drag.position = Math.max(0, Math.min(100, drag.position + delta));
    drag.lastX = event.clientX;
    setSplit(drag.position);
  }
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', event => {
    move(event);
    if (event.pointerId !== drag?.id) return;
    if (!drag.horizontal && drag.tap !== null) setSplit(drag.tap);
    finish();
  });
  stage.addEventListener('pointercancel', event => { if (event.pointerId === drag?.id) finish(); });
  stage.addEventListener('lostpointercapture', event => {
    if (event.target === stage && event.pointerId === drag?.id) finish();
  });
}

for (const [index, item] of series.entries()) {
  const {key, title, looks, group = '女士'} = item;
  const section = document.createElement('section');
  section.className = 'scene';
  section.classList.toggle('reverse', Boolean(item.reverse));
  section.classList.toggle('ensemble', Boolean(item.fullLook));
  section.id = 'series-' + key;
  section.setAttribute('aria-label',title);
  section.innerHTML = '<div class="stage"><div class="copy"></div><figure class="hero"><div class="mount"><div class="pair"></div></div><figcaption></figcaption></figure><div class="materials" role="group" aria-label="本组参考图、服装与布样"></div></div>';
  const copy = section.querySelector('.copy');
  if (index === 0) {
    copy.innerHTML = '<h1>把喜欢，<br>穿上身。</h1><p class="hint">左右拖动，看看哪件更适合你</p>';
  } else {
    copy.innerHTML = '<h2>' + title + '</h2>';
    if (item.group && series[index - 1].group !== item.group) {
      const label = document.createElement('p');
      label.className = 'chapter-label';
      label.textContent = group + '系列';
      copy.prepend(label);
    }
  }
  const pair = section.querySelector('.pair');
  for (const side of ['b','a']) {
    const image = new Image();
    image.src = 'atelier/' + (item.portrait || key) + '-' + side + '.webp';
    image.className = 'look-' + side;
    image.alt = looks[side === 'a' ? 0 : 1] + '试穿效果';
    image.draggable = false;
    if (index) image.loading = 'lazy';
    pair.append(image);
  }
  pair.insertAdjacentHTML('beforeend','<span class="divider" aria-hidden="true"><b>↔</b></span><input type="range" min="0" max="100" value="50">');
  const range = pair.querySelector('input');
  range.setAttribute('aria-label',title + '，左右滑动比较' + looks.join('和'));
  range.addEventListener('input', () => pair.style.setProperty('--split',range.value + '%'));
  enableComparisonSwipe(section.querySelector('.stage'), pair, range);
  const caption = section.querySelector('figcaption');
  if (item.fullLook) {
    looks.forEach((look, side) => {
      const line = document.createElement('span');
      const label = document.createElement('small');
      label.textContent = side === 0 ? '左' : '右';
      line.append(label, look);
      caption.append(line);
    });
  } else {
    caption.textContent = looks.join('　／　');
  }

  for (const [file, alt, x, y, width, angle, [phoneX, phoneY, phoneWidth]] of item.pieces) {
    const piece = document.createElement('div');
    piece.className = 'piece';
    const priorCut = file.startsWith('@');
    const matchedGarment = file.startsWith('looks/');
    const sharedFile = matchedGarment || /^(?:[A-E]|M\d+)-/.test(file);
    const basename = priorCut ? file.slice(1) : sharedFile ? file : key+'-'+file;
    piece.classList.toggle('swatch', swatches.has(file) || swatches.has(basename));
    piece.classList.toggle('garment', matchedGarment || garments.has(file) || garments.has(basename));
    // Neighboring pieces share a trajectory. The phase varies gently across the paper.
    const column = x < 50 ? 'left' : 'right';
    const row = y < 65 ? 'upper' : 'lower';
    piece.dataset.cluster = row + '-' + column;
    piece.style.setProperty('--phase', -(index * 2 + x / 60 + y / 80) + 's');
    for (const [prop,value] of Object.entries({x:x+'%', y:y+'%', w:width+'%', angle:angle+'deg', 'phone-x':phoneX+'%', 'phone-y':phoneY+'%', 'phone-w':phoneWidth+'%'})) {
      piece.style.setProperty('--'+prop,value);
    }
    const image = new Image();
    image.alt = alt;
    image.decoding = 'async';
    if (index) image.loading = 'lazy';
    if (file === item.fold) {
      attachPullTag(piece, image, basename, reducedMotion);
    } else {
      image.src = (priorCut ? 'pics/' : 'atelier/') + basename + '.webp';
      piece.append(image);
    }
    section.querySelector('.materials').append(piece);
  }
  stories.append(section);
}

for (const opener of document.querySelectorAll('button[aria-haspopup="dialog"]')) {
  opener.addEventListener('click', () => {
    const route = opener.getAttribute('aria-controls');
    location.assign('../?v=tryon-chat#' + route);
  });
}

const accountEntry = document.querySelector('button[aria-controls="account"]');
const demoAccount = document.getElementById('demo-account');
let demoSignedIn = false;
demoAccount.addEventListener('click', () => {
  demoSignedIn = !demoSignedIn;
  accountEntry.textContent = demoSignedIn ? '演示账号' : '登陆/注册';
  document.getElementById('account-label').textContent = accountEntry.textContent;
  document.getElementById('account-status').textContent = demoSignedIn
    ? '已进入演示账号，刷新页面后结束本次体验。'
    : '前端预览可使用演示账号体验。';
  demoAccount.textContent = demoSignedIn ? '退出演示账号' : '使用演示账号';
});

const scenes = [...stories.children];
const seriesNav = document.querySelector('.series-nav');
const seriesLinks = new Map([...seriesNav.querySelectorAll('a')].map(link => [link.hash.slice(1), link]));
const firstSeriesLink = seriesNav.querySelector('a');
let currentSeriesLink = firstSeriesLink;
let scheduled = false;
function positionPieces() {
  const {top: navTop, bottom: navBottom} = seriesNav.getBoundingClientRect();
  seriesNav.classList.toggle('is-pinned', navTop <= 0);
  const readingLine = navBottom + (innerHeight - navBottom) * .25;
  let visibleSeriesLink = firstSeriesLink;
  for (const scene of scenes) {
    const box = scene.getBoundingClientRect();
    if (seriesLinks.has(scene.id) && box.top <= readingLine) visibleSeriesLink = seriesLinks.get(scene.id);
    scene.style.setProperty('--play-state', box.bottom > 0 && box.top < innerHeight ? 'running' : 'paused');
    const progress = Math.max(-1,Math.min(1,(innerHeight/2-box.top-box.height/2)/box.height));
    scene.style.setProperty('--drift',(reducedMotion.matches ? 0 : progress*23)+'px');
  }
  if (visibleSeriesLink !== currentSeriesLink) {
    currentSeriesLink.removeAttribute('aria-current');
    visibleSeriesLink.setAttribute('aria-current', 'location');
    currentSeriesLink = visibleSeriesLink;
  }
  scheduled = false;
}
function schedule() {
  if (!scheduled) { scheduled = true; requestAnimationFrame(positionPieces); }
}
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',schedule);
reducedMotion.addEventListener('change',schedule);
positionPieces();
