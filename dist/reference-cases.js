// Only the garments in pieces change between the two photographs.
// A matching bottom on a single-item example is an optional addition in the picker.
const referenceCases = (() => {
  const photo = id => 'assets/lookbook/collections/atelier/' + id + '.webp';
  const cut = id => 'img/reference-garments/' + id + '.webp';
  const before = id => 'img/reference-originals/' + id + '.webp';
  const top = (name, url) => ({id:url, name, url, kind:'top'});
  const bottom = (name, url) => ({id:url, name, url, kind:'bottom', needsFullPhoto:true});

  const ivory = bottom('米白长裤', cut('ivory-trousers'));
  const sand = bottom('卡其长裤', photo('M2-trousers'));
  const school = bottom('卡其童裤', photo('K1-khaki'));
  const joggers = bottom('灰色运动裤', photo('K2-joggers'));
  const office = bottom('炭灰西裤', cut('tailored-trousers'));
  const jeans = bottom('水洗牛仔童裤', cut('kids-jeans'));
  const graphite = bottom('深灰长裤', cut('graphite-trousers'));
  const mensJeans = bottom('靛蓝牛仔裤', photo('M4-jeans'));
  const chinos = bottom('米白直筒裤', photo('M4-chinos'));

  function single(category, original, result, swatch, garment, companion) {
    return {category, original, result, swatch:cut('swatch-' + swatch) + '?v=fabric',
      title:garment.name, pieces:[garment], companion};
  }

  function outfit(category, title, original, result, pieces) {
    return {category, title, original, result:photo(result),
      swatch:cut('swatch-' + result), pieces};
  }

  const shirt = top('细条纹衬衫', cut('c-shirt'));
  const coat = top('卡其风衣', cut('trench'));
  const trousers = bottom('藏青褶裥长裤', cut('c-pants'));
  const trenchLook = outfit('通勤', '卡其风衣配藏青长裤', photo('C-set-b'), 'C-set-a', [shirt, coat, trousers]);
  trenchLook.sampleResults = [
    {pieces:[shirt, trousers], url:'img/results/sample-shirt.jpg?v=0599e092'},
    {pieces:[coat, trousers], url:'img/results/sample-trench.jpg?v=770c721c'}
  ];

  return [
    {...single('通勤', 'img/original.webp', 'assets/lookbook/img/top-a.webp', 'D-a', top('雾蓝条纹衬衫', cut('stripe-shirt')), ivory),
      wideResult: before('stripe-result-wide')},
    single('日常', before('m2-before'), photo('M2-a'), 'M2-a', top('浅色针织', photo('M2-pullover')), sand),
    single('童装', before('k1-before'), photo('K1-b'), 'K1-b', top('奶黄针织开衫', cut('kids-cardigan')), school),
    single('日常', before('b-before'), photo('B-a'), 'B-a', top('奶油针织', cut('cream-knit')), ivory),
    single('通勤', before('b-before'), photo('B-b'), 'B-b', top('棕色短外套', cut('suede-shirt')), ivory),
    single('日常', photo('E-soft-a'), photo('E-soft-b'), 'E-soft-b', top('酒红开衫', cut('red-cardigan')), ivory),
    trenchLook,
    single('童装', photo('K2-a'), photo('K2-b'), 'K2-b', top('棒球夹克', cut('varsity')), joggers),
    single('通勤', before('m1-before'), photo('M1-a'), 'M1-a', top('浅蓝衬衫', cut('office-shirt')), office),
    single('日常', before('m2-before'), photo('M2-b'), 'M2-b', top('丹宁衬衫', cut('denim-shirt')), sand),
    single('通勤', photo('M1-a'), photo('M1-b'), 'M1-b', top('深蓝西装', cut('navy-blazer')), office),
    single('童装', before('k3-before'), photo('K3-a'), 'K3-a', top('红白条纹衫', cut('breton')), jeans),
    single('日常', photo('M3-a'), photo('M3-b'), 'M3-b', top('橄榄绿夹克', photo('M3-shell')), graphite),
    outfit('通勤', '砖红衬衫配米白裤', photo('M4-a'), 'M4-b', [top('砖红衬衫', photo('M4-shirt')), chinos]),
    outfit('童装', '米白 Polo 配牛仔裤', photo('K4-b'), 'K4-a', [top('米白 Polo', photo('K4-polo')), bottom('靛蓝牛仔童裤', photo('K4-jeans'))]),
    outfit('日常', '针织 Polo 配牛仔裤', photo('M4-b'), 'M4-a', [top('米白针织 Polo', cut('knit-polo')), mensJeans]),
    outfit('通勤', '驼色风衣配藏青裤', photo('M5-b'), 'M5-a', [
      top('白色圆领 T 恤', cut('m5-tee')), top('驼色长风衣', photo('M5-coat')), bottom('藏青长裤', photo('M5-navy'))
    ]),
    single('童装', before('k1-before'), photo('K1-a'), 'K1-a', top('雾蓝衬衫', cut('blue-kids')), school),
    single('日常', photo('M3-b'), photo('M3-a'), 'M3-a', top('米色工装衬衫', cut('khaki-overshirt')), graphite),
    single('童装', photo('K2-b'), photo('K2-a'), 'K2-a', top('灰白卫衣', photo('K2-sweatshirt')), joggers),
    outfit('通勤', '炭灰西装配灰西裤', photo('M5-a'), 'M5-b', [
      top('浅灰圆领针织', cut('m5-knit')), top('炭灰西装', photo('M5-blazer')), bottom('灰色羊毛西裤', photo('M5-grey'))
    ]),
    single('童装', photo('K3-a'), photo('K3-b'), 'K3-b', top('鼠尾草绿外搭', cut('sage-kids')), jeans),
    single('日常', photo('E-b'), photo('E-a'), 'E-a', top('白色背心', cut('ivory-tank')), ivory),
    outfit('童装', '砖红外套配格纹裙', before('k5-before'), 'K5-b', [
      top('奶油绞花毛衣', cut('k5-knit')), top('砖红灯芯绒短外套', photo('looks/k5-jacket')),
      bottom('格纹百褶半裙', photo('looks/k5-skirt'))
    ])
  ];
})();
