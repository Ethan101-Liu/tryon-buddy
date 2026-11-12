const $ = selector => document.querySelector(selector);
const labels = {top: '上装', bottom: '下装'};
const sampleWardrobe = [
  {id:'img/reference-garments/m5-tee.webp', name:'白 T 恤', url:'img/reference-garments/m5-tee.webp', kind:'top'},
  {id:'img/reference-garments/stripe-shirt.webp', name:'雾蓝条纹衬衫', url:'img/reference-garments/stripe-shirt.webp', kind:'top'},
  {id:'wardrobe-cable-knit', name:'奶油绞花针织', url:'img/sweater.webp', kind:'top'},
  {id:'img/reference-garments/ivory-trousers.webp', name:'米白长裤', url:'img/reference-garments/ivory-trousers.webp', kind:'bottom', needsFullPhoto:true},
  {id:'img/reference-garments/graphite-trousers.webp', name:'深灰长裤', url:'img/reference-garments/graphite-trousers.webp', kind:'bottom', needsFullPhoto:true}
];
const items = {single: [], top: [], bottom: []};
let mode = 'single';
let stackOutfitTops = false;

if (matchMedia('(pointer: fine)').matches) {
  const modifier = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
  $('.upload-hint').textContent = '可拖入多张图片，或在文件窗口按住 ' + modifier + ' 多选。';
}

function addItems(slot, images) {
  if (!images.length) return;
  items[slot].push(...images);
  render();
}

async function addFiles(slot, files) {
  const images = Array.from(files);
  if (!images.length) return;
  const destination = items[slot];
  try {
    for (const file of images) await checkUploadedImage(file, 'garment');
  } catch (error) {
    if (typeof notice === 'function') notice(error.message || '图片检查未完成，请重新选择。');
    return;
  }
  if (items[slot] !== destination) return;
  addItems(slot, images.map(file => {
    const url = URL.createObjectURL(file);
    const kind = slot === 'bottom' ? 'bottom' : 'top';
    return {id:url, name:file.name.replace(/\.[^.]+$/, '') || file.name, url, kind, file, local:true, needsFullPhoto:kind === 'bottom'};
  }));
}

function layerGroup(pieces) {
  return {
    id: 'layers:' + JSON.stringify(pieces.map(piece => piece.id).sort()),
    cards: [...pieces],
    layers: [...pieces]
  };
}

function applyReferenceSelection(pieces, onApplied) {
  if (!pieces.length) return;
  const tops = pieces.filter(piece => piece.kind === 'top');
  const bottoms = pieces.filter(piece => piece.kind === 'bottom');
  const outfit = tops.length > 0 && bottoms.length > 0;
  const incoming = {top:tops, bottom:bottoms};
  function apply() {
    mode = outfit ? 'outfit' : 'single';
    let selectedIndex = 0;
    if (outfit) {
      stackOutfitTops = tops.length > 1;
      for (const slot of ['top', 'bottom']) {
        for (const item of items[slot]) {
          if (item.local && !incoming[slot].some(next => next.url === item.url)) URL.revokeObjectURL(item.url);
        }
        items[slot] = incoming[slot];
      }
    } else {
      const layering = tops.length > 1;
      const entry = layering ? layerGroup(tops) : pieces[0];
      if (layering) items.single = items.single.filter(item => !tops.some(piece => piece.id === item.id));
      selectedIndex = items.single.findIndex(item => item.id === entry.id);
      if (selectedIndex < 0) selectedIndex = items.single.push(entry) - 1;
      else items.single[selectedIndex] = entry;
    }
    render();
    onApplied(selectedIndex);
  }

  if (outfit) {
    const removed = [], added = [], kept = [];
    for (const slot of ['top', 'bottom']) {
      const remaining = [...incoming[slot]];
      for (const current of items[slot]) {
        const match = remaining.findIndex(next => next.id === current.id);
        if (match < 0) removed.push(current);
        else kept.push(...remaining.splice(match, 1));
      }
      added.push(...remaining);
    }
    if (removed.length) {
      confirmOutfitReplacement(removed, added, kept, apply);
      return;
    }
  }
  apply();
}

function confirmOutfitReplacement(removed, added, kept, apply) {
  const dialog = $('#replace-outfit');
  function showPieces(selector, pieces) {
    const list = dialog.querySelector(selector);
    list.closest('section').hidden = !pieces.length;
    list.replaceChildren(...pieces.map(piece => {
      const row = document.createElement('li');
      const image = new Image();
      image.src = piece.url;
      image.alt = '';
      const caption = document.createElement('div');
      const kind = document.createElement('small');
      kind.textContent = labels[piece.kind];
      const name = document.createElement('b');
      name.textContent = piece.name;
      caption.append(kind, name);
      row.append(image, caption);
      return row;
    }));
  }
  showPieces('.replace-removed', removed);
  showPieces('.replace-added', added);
  showPieces('.replace-kept ul', kept);
  dialog.querySelector('.replace-arrow').hidden = !added.length;
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    dialog.close();
    if (event.submitter?.value === 'replace') apply();
  };
  dialog.onclose = () => {
    if (dialog.open) return;
    dialog.querySelector('form').onsubmit = null;
    dialog.querySelectorAll('ul').forEach(list => list.replaceChildren());
  };
  dialog.showModal();
}

function openPopup(title) {
  $('#popup h3').textContent = title;
  $('#content').replaceChildren();
  $('#popup').showModal();
}

function button(text, className, action) {
  const node = document.createElement('button');
  node.textContent = text;
  node.className = className;
  node.onclick = action;
  return node;
}

function chooseSaved(slot) {
  openPopup('从我的衣服选');
  const choices = personalWardrobe.items().filter(item => slot === 'single' || item.kind === slot);
  const owner = personalPhoto.account();
  const selectedItems = items[slot];
  const existing = new Set(selectedItems.flatMap(entry => entry.cards || [entry]).map(item => item.id));
  const picker = document.createElement('div');
  picker.className = 'wardrobe-picker';
  const grid = document.createElement('div');
  grid.className = 'wardrobe-grid';
  const pending = new Set();

  const footer = document.createElement('div');
  footer.className = 'wardrobe-footer';
  const cancel = button('取消', 'ghost', () => $('#popup').close());
  const confirm = button('请选择衣物', 'primary', () => {
    if (personalPhoto.account() !== owner || [...pending].some(item=>!personalWardrobe.items().includes(item))) return;
    $('#popup').close();
    addItems(slot, [...pending].map(item=>item.file?{...item,url:URL.createObjectURL(item.file),local:true}:item));
  });
  confirm.disabled = true;
  for (const item of choices) {
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = check.disabled = existing.has(item.id);
    check.onchange = () => {
      if (check.checked) pending.add(item);
      else pending.delete(item);
      confirm.disabled = !pending.size;
      confirm.textContent = pending.size ? '添加 ' + pending.size + ' 件' : '请选择衣物';
    };
    const img = new Image();
    img.alt = '';
    img.src = item.url;
    const name = document.createElement('span');
    name.textContent = item.name;
    label.append(check, img, name);
    if (check.disabled) {
      const status = document.createElement('small');
      status.textContent = '已添加';
      label.append(status);
    }
    grid.append(label);
  }
  footer.append(cancel, confirm);
  picker.append(grid, footer);
  $('#content').append(picker);
}

function garmentCard(item, role, onRemove, onKindChange) {
  const remove = button('×', 'remove', onRemove);
  remove.setAttribute('aria-label', '移除' + item.name);
  const img = new Image();
  img.src = item.url;
  img.alt = item.name;
  const card = document.createElement('figure');
  const caption = document.createElement('figcaption');
  if (role) {
    const label = document.createElement('small');
    label.textContent = role;
    caption.append(label);
  }
  const name = document.createElement('b');
  name.textContent = name.title = item.name;
  caption.append(name);
  if (onKindChange) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', item.name + '的类别');
    select.add(new Option('上装', 'top'));
    select.add(new Option('下装', 'bottom'));
    select.value = item.kind;
    select.onchange = () => onKindChange(select.value);
    caption.append(select);
  }
  card.append(img, caption, remove);
  return card;
}

function joinTops(first, second) {
  const index = items.single.indexOf(first);
  items.single.splice(index, 1, layerGroup([first, second]));
  items.single.splice(items.single.indexOf(second), 1);
  render();
}

function chooseLayerPair(tops) {
  openPopup('选择两件要叠穿的上衣');
  const choices = document.createElement('div');
  choices.className = 'layer-choices';
  const confirm = button('将这两件叠穿', 'ghost', () => {
    const selected = [...choices.querySelectorAll('input:checked')].map(input => tops[Number(input.value)]);
    $('#popup').close();
    joinTops(selected[0], selected[1]);
  });
  confirm.disabled = true;
  tops.forEach((piece, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(index);
    const img = new Image();
    img.src = piece.url;
    img.alt = '';
    label.append(input, img, piece.name);
    choices.append(label);
  });
  choices.onchange = () => {
    const ready = choices.querySelectorAll('input:checked').length === 2;
    confirm.disabled = !ready;
    choices.querySelectorAll('input:not(:checked)').forEach(input => { input.disabled = ready; });
  };
  $('#content').append(choices, confirm);
}

function describeLayerOrder(pieces) {
  if (pieces.length === 2) return pieces[0].name + '在内，' + pieces[1].name + '在外';
  return '从内到外：' + pieces.map(piece => piece.name).join(' → ');
}

function layerPanel(group) {
  const panel = document.createElement('section');
  panel.className = 'layer-block';
  panel.setAttribute('aria-label', '叠穿顺序');
  const head = document.createElement('div');
  head.className = 'layer-heading';
  const cancel = button('取消叠穿', 'cancel-layers', () => {
    const index = items.single.indexOf(group);
    items.single.splice(index, 1, ...group.cards);
    render();
  });
  const count = document.createElement('small');
  count.className = 'layer-count';
  count.textContent = '本组 1 张';
  head.append('叠穿顺序', count, cancel);
  const order = document.createElement('div');
  order.className = 'layer-order';
  const sequence = document.createElement('p');
  sequence.className = 'layer-sequence';
  sequence.setAttribute('aria-live', 'polite');
  sequence.textContent = describeLayerOrder(group.layers);
  const swap = button('⇅ 交换顺序', 'swap-layers', () => {
    group.layers.reverse();
    sequence.textContent = describeLayerOrder(group.layers);
  });
  order.append(sequence, swap);
  panel.append(head, order);
  return panel;
}

function outfitMethod(looksPerBottom) {
  const stacked = stackOutfitTops;
  const options = document.createElement('div');
  options.className = 'outfit-ways';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', '上装穿法');
  for (const [text, stack] of [['分别搭配', false], ['叠穿成套', true]]) {
    const choice = button(text, '', () => { stackOutfitTops = stack; render(); });
    choice.setAttribute('aria-pressed', String(stackOutfitTops === stack));
    options.append(choice);
  }
  const estimate = document.createElement('p');
  estimate.className = 'outfit-estimate';
  const bottoms = items.bottom;
  const tops = stacked ? describeLayerOrder(items.top) : items.top.length + ' 件上衣';
  if (bottoms.length) {
    const bottom = bottoms.length === 1 ? bottoms[0].name : bottoms.length + ' 款下装';
    const pairing = stacked ? '，搭配' : '分别搭配';
    estimate.textContent = tops + pairing + bottom + ' · 共 ' + looksPerBottom * bottoms.length + ' 张';
  } else {
    estimate.textContent = (stacked ? tops + '。' : '') + '添加下装后，每款下装出 ' + looksPerBottom + ' 张';
  }
  const section = document.createElement('div');
  section.className = 'outfit-method';
  section.append(options, estimate);
  return section;
}

function makeSlot(slot) {
  const box = document.createElement('div');
  box.className = 'slot ' + slot;
  if (slot !== 'single') {
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', labels[slot]);
    const header = document.createElement('div');
    header.className = 'slot-heading';
    const heading = document.createElement('h4');
    const count = document.createElement('small');
    count.textContent = '· ' + items[slot].length + ' 件';
    heading.append(labels[slot], count);
    header.append(heading);
    if (slot === 'top' && stackOutfitTops && items.top.length === 2) {
      header.append(button('交换内外顺序', 'link layer-control', () => { items.top.reverse(); render(); }));
    }
    box.append(header);
  }
  const previews = document.createElement('div');
  previews.className = 'previews';
  const stacked = slot === 'top' && stackOutfitTops;
  items[slot].forEach((entry, index) => {
    const cards = entry.cards || [entry];
    for (const item of cards) {
      const role = stacked ? (index === 0 ? '内搭' : index === items.top.length - 1 ? '外搭' : '中间层') : '';
      const remove = () => {
        items[slot].splice(index, 1, ...cards.filter(piece => piece !== item));
        if (item.local) URL.revokeObjectURL(item.url);
        render();
      };
      const changeKind = kind => {
        const updated = {...item, kind, needsFullPhoto:kind === 'bottom'};
        items.single.splice(index, 1, ...cards.map(piece => piece === item ? updated : piece));
        render();
      };
      const card = garmentCard(item, role, remove, slot === 'single' ? changeKind : null);
      if (stacked && items.top.length > 2 && index > 0) {
        card.append(button('往里一层', 'link', () => {
          [items.top[index - 1], items.top[index]] = [items.top[index], items.top[index - 1]];
          render();
        }));
      }
      card.dataset.entry = String(index);
      previews.append(card);
    }
  });
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.hidden = true;
  input.multiple = true;
  input.onchange = () => addFiles(slot, input.files);
  enableFileDrop(box, files => addFiles(slot, files));
  const empty = items[slot].length === 0;
  const actions = document.createElement('div');
  actions.className = 'slot-actions';
  actions.append(button(empty ? '＋ 本地上传' : '＋ 继续上传', 'ghost', () => input.click()),
    button('从我的衣服选', 'ghost', () => chooseSaved(slot)));
  box.append(input);
  if (empty) {
    const dropzone = $('#garment-upload-empty').content.firstElementChild.cloneNode(true);
    if (slot !== 'single') {
      dropzone.querySelector('.drop-prompt').textContent = '将' + labels[slot] + '图片拖到这里';
      dropzone.querySelector('.drop-release').textContent = '松开添加' + labels[slot];
    }
    dropzone.onclick = event => {
      if (!event.target.closest('button')) input.click();
    };
    dropzone.append(actions);
    box.append(dropzone);
    return box;
  }
  box.append(previews, actions);
  if (slot === 'single') {
    for (const entry of items.single) {
      if (entry.layers) box.append(layerPanel(entry));
    }
    const tops = [...new Map(items.single.filter(item => item.kind === 'top').map(item => [item.id, item])).values()];
    if (tops.length >= 2) {
      const prompt = button(tops.length === 2 ? '将这两件叠穿' : '选择两件上衣叠穿', 'layer-block layer-heading layer-start', () => {
        if (tops.length === 2) joinTops(tops[0], tops[1]);
        else chooseLayerPair(tops);
      });
      const hint = document.createElement('small');
      hint.className = 'layer-count';
      hint.textContent = '合为 1 张';
      prompt.append(hint);
      box.append(prompt);
    }
  }
  return box;
}

function renderFooter() {
  const single = mode === 'single';
  const count = single ? items.single.length :
    (stackOutfitTops ? 1 : items.top.length) * items.bottom.length;
  const footer = $('.generate-foot');
  const generate = footer.querySelector('button');
  let action = 'idle';
  let status = '预计生成';
  let label = '生成试穿图';
  if (!single && items.top.length && !items.bottom.length) {
    action = 'bottom';
    status = '待补下装';
    label = '添加下装';
  } else if (count) {
    action = currentPortrait ? 'generate' : 'portrait';
    status = currentPortrait ? '照片已就绪' : '待补本人照';
    label = currentPortrait ? '生成 ' + count + ' 张试穿图' : '上传本人照';
  }
  footer.dataset.action = action;
  const prompt = $('.outfit-photo-prompt');
  prompt.hidden = single || !count;
  if (!prompt.hidden) {
    const garment = items.bottom.every(piece => piece.name.endsWith('长裤')) ? '长裤' : '下装';
    $('#outfit-photo-guide').textContent = currentPortrait ? '已添加试穿照' : '试穿' + garment + '需要正面全身照';
  }
  $('.upload-hint').hidden = !count || !prompt.hidden;
  footer.querySelector('.microline span').textContent = status;
  footer.querySelector('.microline strong').textContent = count ? '预计 ' + count + ' 张' : '0 张试穿图';
  generate.disabled = action === 'idle';
  generate.firstChild.textContent = label + ' ';
  generate.querySelector('span').textContent = action === 'portrait' ? '↑' : '→';
}

function render() {
  const single = mode === 'single';
  if (items.top.length < 2) stackOutfitTops = false;
  const topLooks = stackOutfitTops ? 1 : items.top.length;
  const slots = single ? ['single'] : ['top', 'bottom'];
  const container = $('#slots');
  container.classList.toggle('outfit-sections', !single);
  container.replaceChildren(...slots.map(makeSlot));
  if (!single && items.top.length > 1) container.append(outfitMethod(topLooks));
  renderFooter();
  for (const tab of document.querySelectorAll('[data-mode]')) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-pressed', selected);
    tab.classList.toggle('on', selected);
  }
}
for (const tab of document.querySelectorAll('[data-mode]')) {
  tab.onclick = () => { mode = tab.dataset.mode; render(); };
}
$('#rules').onclick = () => {
  const rules = $('#image-rules');
  const single = mode === 'single';
  $('#mode-heading').textContent = single ? '单件试穿怎么选图？' : '成套搭配怎么选图？';
  $('#mode-note').textContent = single
    ? '每张展示一件上衣或一条裤子，可一次选多款，每款单独出一张。优先用轮廓完整的平铺图，也可以用衣物清楚可见的真人上身图。'
    : '上装和下装分区添加，两区都支持多选或拖入多张图，每张只展示一件。选「分别搭配」时，每款上衣与每款下装各搭一套，每套出一张。选「叠穿成套」时，上衣按内外顺序叠穿，每款下装出一张。';
  $('#mixed-caption').textContent = single ? '多件同框' : '整套放入一格';
  for (const examples of rules.querySelectorAll('[data-examples]')) {
    examples.hidden = examples.dataset.examples !== mode;
  }
  rules.querySelectorAll('details').forEach((section, index) => {
    section.open = index < 2;
  });
  rules.showModal();
  rules.querySelector('.rules-body').scrollTop = 0;
};
$('.generate-foot button').onclick = () => {
  const action = $('.generate-foot').dataset.action;
  if (action === 'bottom') {
    const slot = $('#slots .slot.bottom');
    slot.querySelector('.garment-dropzone button').focus({preventScroll:true});
    slot.scrollIntoView({block:'center'});
    return;
  }
  if (action === 'portrait') {
    openPortraitPicker();
    return;
  }
  const single = mode === 'single';
  const outfits = single ? items.single.map(entry => entry.layers || [entry])
    : (stackOutfitTops ? [items.top] : items.top.map(top => [top]))
        .flatMap(tops => items.bottom.map(bottom => [...tops, bottom]));
  if (!outfits.length) return;
  const bottomLabel = items.bottom.every(piece => piece.name.endsWith('长裤')) ? ' 条长裤' : ' 件下装';
  const summary = single ? (outfits.some(pieces => pieces.length > 1) ? '按选定的叠穿顺序生成' : '每件衣物单独试穿')
    : items.top.length + ' 件上衣' + (stackOutfitTops ? '叠穿，搭配 ' : '分别搭配 ') + items.bottom.length + bottomLabel;
  const modeName = single ? '单件试穿' : (stackOutfitTops ? '叠穿成套' : '分别搭配');
  showTryOnResults(outfits, modeName, summary, currentPortrait);
};
const portraitFile = $('#portrait-file');
let portraitUrl;
let currentPortrait;
let portraitRequest = 0;
let pickerFromOutfitPrompt = false;

function openPortraitPicker(fromOutfitPrompt = false) {
  pickerFromOutfitPrompt = fromOutfitPrompt;
  portraitFile.click();
}

function enableFileDrop(target, onFiles) {
  target.ondragover = event => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    target.classList.add('drop-active');
  };
  target.ondragleave = event => {
    if (!target.contains(event.relatedTarget)) target.classList.remove('drop-active');
  };
  target.ondrop = event => {
    event.preventDefault();
    target.classList.remove('drop-active');
    if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
  };
}

function portraitStatus(text) {
  document.querySelectorAll('.portrait-status').forEach(label => { label.textContent = text; });
}

function setPortrait(file, url) {
  const previous = portraitUrl;
  currentPortrait = file;
  portraitUrl = url;
  for (const img of document.querySelectorAll('.portrait-picker img, .outfit-photo-prompt img')) {
    if (url) img.src = url;
    else img.removeAttribute('src');
  }
  for (const action of document.querySelectorAll('.portrait-action')) {
    if (action.dataset.replaceLabel) {
      action.firstChild.textContent = url ? action.dataset.replaceLabel + ' ' : '上传照片 ';
    } else {
      action.textContent = url ? '更换照片 ↗' : '上传本人照 ↗';
    }
  }
  $('#remove-photo').hidden = !file;
  portraitStatus(file ? '已上传' : '未上传');
  renderFooter();
  if (previous) URL.revokeObjectURL(previous);
}

$('#remove-photo').onclick = () => {
  ++portraitRequest;
  portraitFile.value = '';
  pickerFromOutfitPrompt = false;
  setPortrait(null, null);
  $('.source .portrait-picker').focus({preventScroll:true});
};

async function selectPortrait(files, revealGenerate = false, isCurrent = () => true) {
  if (!files.length) return;
  const request = ++portraitRequest;
  if (files.length > 1) return portraitStatus('请一次选择一张照片');
  let file;
  try {
    file = await preparePortrait(files[0]);
  } catch (error) {
    if (request === portraitRequest && isCurrent()) {
      portraitStatus(error.message);
      if (typeof notice === 'function') notice(error.message);
    }
    return;
  }
  if (request !== portraitRequest || !isCurrent()) return;
  setPortrait(file, URL.createObjectURL(file));
  if (revealGenerate && !$('.outfit-photo-prompt').hidden) {
    const pane = $('.setup');
    const desktop = matchMedia('(min-width:841px)').matches;
    const viewport = window.visualViewport;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const visibleBottom = desktop ? Math.min(pane.getBoundingClientRect().bottom, viewportBottom) : viewportBottom;
    const buttonBottom = pane.querySelector('.generate-foot button').getBoundingClientRect().bottom;
    if (buttonBottom > visibleBottom) {
      const scroller = desktop ? pane : window;
      scroller.scrollBy({top:buttonBottom - visibleBottom + 12, behavior:'instant'});
    }
  }
  return file;
}

for (const picker of document.querySelectorAll('.portrait-picker')) {
  enableFileDrop(picker, selectPortrait);
  picker.onclick = () => openPortraitPicker();
}
for (const action of document.querySelectorAll('.portrait-action')) {
  action.onclick = () => openPortraitPicker(Boolean(action.closest('.outfit-photo-prompt')));
}
portraitFile.onchange = () => {
  selectPortrait(portraitFile.files, pickerFromOutfitPrompt);
  pickerFromOutfitPrompt = false;
  portraitFile.value = '';
};
portraitFile.oncancel = () => { pickerFromOutfitPrompt = false; };
render();
