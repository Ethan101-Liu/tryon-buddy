const resultTab = $('#results-tab');
const referenceTab = $('#reference-tab');
const resultView = $('#results-view');
const referencePanel = $('#reference-view');
const resultGrid = $('#result-grid');
const resultFilter = $('.result-filter');
const [showAll, showSaved] = resultFilter.querySelectorAll('button');
let shortlistOnly = false;
const lightbox = $('#result-lightbox');
const lightboxTrack = lightbox.querySelector('.lightbox-track');
const sampleTools = lightbox.querySelector('.sample-tools');
const sampleOriginals = sampleTools.querySelector('.sample-originals');
const originalPieces = sampleOriginals.querySelector('.sample-original-pieces');
sampleOriginals.ontoggle = () => {
  sampleOriginals.querySelector('summary').textContent = sampleOriginals.open ? '收起衣物原图' : '查看衣物原图';
};
const shortlistAction = lightbox.querySelector('.shortlist-action');
const [previousPhoto, nextPhoto] = lightbox.querySelectorAll('.lightbox-nav button');
let enlargedButton = null;
let openedPhoto = null;

let lastBatch;

function selectView(tab) {
  if(tab===resultTab && $('.layoutA').matches('.chat-layout,.mobile-ref-open'))return;
  const results = tab === resultTab;
  if (!results && sampleLoad) resetSampleEntry();
  $('.lookbook').classList.toggle('results-active', results);
  referencePanel.hidden = results;
  $('.look-filters').hidden = results;
  resultView.hidden = !results;
  for (const item of [resultTab, referenceTab]) {
    item.setAttribute('aria-selected', String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  }
  referencePanel.dispatchEvent(new Event('viewchange'));
  if (results && matchMedia('(max-width:840px)').matches) {
    resultView.closest('.lookbook').scrollIntoView({block:'start'});
  }
}

for (const tab of [referenceTab, resultTab]) {
  tab.onclick = () => selectView(tab);
  tab.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? referenceTab : event.key === 'End' ? resultTab
      : tab === referenceTab ? resultTab : referenceTab;
    selectView(next);
    next.focus();
  };
}

lightbox.addEventListener('click', event => {
  const bounds = lightbox.getBoundingClientRect();
  if (event.target === lightbox && (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom)) lightbox.close();
});
function addLightboxImage(button) {
  const image = button.querySelector('img').cloneNode();
  image.draggable = false;
  lightboxTrack.append(image);
}

function updateResultFilter() {
  const cards = [...resultGrid.children];
  const savedCount = cards.filter(card => card.querySelector('.shortlist-mark')).length;
  if (!savedCount) shortlistOnly = false;
  cards.forEach(card => {
    card.hidden = shortlistOnly && !card.querySelector('.shortlist-mark');
    const number = card.dataset.number;
    card.querySelector('.result-number').textContent = shortlistOnly
      ? '原第 ' + number + ' 张' : '第 ' + number + ' 张 / 共 ' + cards.length + ' 张';
  });
  resultGrid.classList.toggle('one-visible', (shortlistOnly ? savedCount : cards.length) === 1);
  resultFilter.hidden = cards.length < 2 || savedCount === 0;
  showAll.querySelector('b').textContent = cards.length;
  showSaved.querySelector('b').textContent = savedCount;
  showAll.setAttribute('aria-pressed', String(!shortlistOnly));
  showSaved.setAttribute('aria-pressed', String(shortlistOnly));
  updateCompareEntry();
}

new ResizeObserver(([entry]) => {
  resultView.style.setProperty('--result-batch-height', entry.target.offsetHeight + 'px');
}).observe($('.result-batch'));

for (const filter of [showAll, showSaved]) {
  filter.onclick = () => {
    const nextShortlistOnly = filter === showSaved;
    if (nextShortlistOnly === shortlistOnly) return;
    shortlistOnly = nextShortlistOnly;
    updateResultFilter();
    resultView.scrollTop = 0;
  };
}

function visiblePhotos() {
  return [...resultGrid.querySelectorAll('.result-card:not([hidden]) button.result-photo')];
}

const compareEntry = $('.compare-entry');
const compareDialog = $('#result-compare');
const comparePicker = $('.compare-picker');
const compareOptions = $('.compare-options');
const compareView = $('.compare-view');
const comparePair = $('.compare-pair');
const compareSwitch = $('.compare-switch');
const compareReselect = $('.compare-reselect');
const compareStart = $('.compare-start');
const resultPieces = new WeakMap();
let comparedPhotos = [];

function selectedNumbers() {
  return [...compareOptions.querySelectorAll('input:checked')].map(input => input.value);
}

function updateCompareChoices() {
  const checked = [...compareOptions.querySelectorAll('input:checked')];
  for (const input of compareOptions.querySelectorAll('input')) {
    input.disabled = !input.checked && checked.length >= 2;
  }
  const picked = $('.compare-picked');
  picked.hidden = checked.length === 0;
  [...picked.children].forEach((chip, i) => {
    const input = checked[i];
    chip.hidden = !input;
    if (!input) {
      chip.onclick = null;
      return;
    }
    const number = '第 ' + input.value + ' 张';
    chip.textContent = number + ' ×';
    chip.setAttribute('aria-label', '移出' + number + ' ' + input.labels[0].querySelector('strong').textContent);
    chip.onclick = () => {
      input.checked = false;
      updateCompareChoices();
      input.focus();
    };
  });
  $('.compare-selected').textContent = '已选 ' + checked.length + ' / 2';
  compareStart.disabled = checked.length !== 2;
}

function addCompareChoice(photo, checked = false) {
  const card = photo.closest('.result-card');
  const row = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = card.dataset.number;
  input.checked = checked;
  const image = photo.querySelector('img').cloneNode();
  image.alt = '';
  const text = document.createElement('span');
  const number = document.createElement('small');
  number.textContent = '第 ' + card.dataset.number + ' 张';
  const meta = document.createElement('span');
  meta.className = 'compare-option-meta';
  meta.append(number);
  const saved = card.querySelector('.shortlist-mark');
  if (saved) meta.append(saved.cloneNode(true));
  text.append(meta, card.querySelector('figcaption strong').cloneNode(true));
  const detail = card.querySelector('figcaption small');
  if (detail) text.append(detail.cloneNode(true));
  row.append(input, image, text);
  compareOptions.append(row);
}

function updateCompareEntry() {
  const photos = visiblePhotos();
  compareEntry.hidden = photos.length < 2;
  if (!compareDialog.open) return;
  if (comparePicker.hidden) {
    compareReselect.hidden = photos.length < 3;
  } else {
    photos.slice(compareOptions.childElementCount).forEach(photo => addCompareChoice(photo));
    updateCompareChoices();
  }
}

function showComparePicker() {
  const reselecting = comparedPhotos.length > 0;
  $('#compare-title').textContent = reselecting ? '重选搭配' : '选两张搭配对比';
  $('.compare-close-text').textContent = reselecting ? '取消重选' : '返回结果';
  compareReselect.hidden = true;
  compareView.hidden = true;
  comparePicker.hidden = false;
  compareOptions.replaceChildren();
  visiblePhotos().forEach(photo => addCompareChoice(photo, comparedPhotos.includes(photo)));
  updateCompareChoices();
  if (compareDialog.open) compareOptions.querySelector('input:checked, input:not(:disabled)')?.focus();
}

function switchComparedPhoto(index) {
  [...comparePair.children].forEach((figure, i) => {
    figure.classList.toggle('current', i === index);
    compareSwitch.children[i].setAttribute('aria-pressed', String(i === index));
  });
}

function showComparedPhotos(photos) {
  const previousIndex = [...comparePair.children].findIndex(figure => figure.classList.contains('current'));
  const previous = comparedPhotos[previousIndex];
  const next = photos.includes(previous) ? previous : photos.find(photo => !comparedPhotos.includes(photo));
  comparedPhotos = photos;
  const cards = photos.map(photo => photo.closest('.result-card'));
  const pieces = cards.map(card => resultPieces.get(card));
  const labels = pieces.map((outfit, i) => {
    const different = outfit.filter(item => !pieces[1-i].some(other => other.id === item.id && other.kind === item.kind));
    return (different.length ? different : outfit).map(item => item.name).join(' ＋ ');
  });

  comparePair.replaceChildren();
  compareSwitch.replaceChildren();
  const images = photos.map(photo => photo.querySelector('img'));
  // The wider original sets a shared image height so switching preserves the framing.
  comparePair.style.setProperty('--pair-ratio', Math.max(...images.map(img => img.naturalWidth / img.naturalHeight)));
  cards.forEach((card, i) => {
    const figure = document.createElement('figure');
    const plate = document.createElement('div');
    plate.className = 'compare-plate';
    const frame = document.createElement('div');
    frame.className = 'compare-frame';
    frame.append(images[i].cloneNode());
    plate.append(frame);
    const caption = card.querySelector('figcaption').cloneNode(true);
    caption.querySelector('.result-miniatures').remove();
    const ordinal = '第 ' + card.dataset.number + ' 张';
    const number = document.createElement('small');
    number.className = 'compare-photo-number';
    number.textContent = ordinal;
    caption.prepend(number);
    figure.append(plate, caption);
    comparePair.append(figure);
    const tab = button('', '', () => switchComparedPhoto(i));
    const thumb = images[i].cloneNode();
    thumb.alt = '';
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = labels[i];
    text.append(number.cloneNode(true), name);
    tab.append(thumb, text);
    compareSwitch.append(tab);
  });
  switchComparedPhoto(Math.max(0, photos.indexOf(next)));
  showCompareView();
}

function showCompareView() {
  $('.compare-close-text').textContent = '返回结果';
  $('#compare-title').textContent = sampleContext.hidden ? '搭配对比' : '示例搭配对比';
  compareReselect.hidden = visiblePhotos().length < 3;
  comparePicker.hidden = true;
  compareView.hidden = false;
  if (compareDialog.open) {
    const activeTab = compareSwitch.querySelector('[aria-pressed="true"]');
    (activeTab.offsetWidth ? activeTab : compareDialog.querySelector('.compare-close')).focus({preventScroll:true});
  }
}

compareEntry.onclick = () => {
  const photos = visiblePhotos();
  if (photos.length < 2) return;
  comparedPhotos = [];
  if (photos.length === 2) showComparedPhotos(photos);
  else showComparePicker();
  compareDialog.showModal();
};
function cancelCompareReselection(event) {
  if (comparePicker.hidden || !comparedPhotos.length) return;
  event.preventDefault();
  showCompareView();
}
compareDialog.querySelector('form').addEventListener('submit', cancelCompareReselection);
compareDialog.addEventListener('cancel', cancelCompareReselection);
compareReselect.onclick = showComparePicker;
compareOptions.onchange = updateCompareChoices;
compareStart.onclick = () => {
  const selected = selectedNumbers();
  const pair = visiblePhotos().filter(photo => selected.includes(photo.closest('.result-card').dataset.number));
  if (pair.length === 2) showComparedPhotos(pair);
};
compareDialog.addEventListener('close', () => {
  if (compareDialog.open) return;
  comparedPhotos = [];
  for (const chip of $('.compare-picked').children) chip.onclick = null;
  compareOptions.replaceChildren();
  comparePair.replaceChildren();
  compareSwitch.replaceChildren();
});

function syncShortlist(card) {
  const saved = Boolean(card.querySelector('.shortlist-mark'));
  shortlistAction.setAttribute('aria-pressed', String(saved));
  shortlistAction.querySelector('.shortlist-text').textContent = saved ? '已加入备选' : '加入备选';
  shortlistAction.title = saved ? '移出备选' : '加入备选';
}

shortlistAction.onclick = () => {
  syncLightbox();
  if (!enlargedButton) return;
  const card = enlargedButton.closest('.result-card');
  const previousIndex = shortlistOnly ? visiblePhotos().indexOf(enlargedButton) : -1;
  const mark = card.querySelector('.shortlist-mark');
  if (mark) {
    mark.remove();
  } else {
    const badge = document.createElement('span');
    badge.className = 'shortlist-mark';
    badge.append(shortlistAction.querySelector('svg').cloneNode(true), '已加入备选');
    card.querySelector('figcaption strong').after(badge);
  }
  setArchiveSaved(card.dataset.archiveId, !mark);
  updateResultFilter();
  if (previousIndex < 0) {
    syncShortlist(card);
    return;
  }
  if (!shortlistOnly) {
    const status = $('.result-status');
    if (status.dataset.complete === 'true') status.textContent = '备选已清空 · 共 ' + resultGrid.children.length + ' 张';
    lightbox.close();
    return;
  }
  const remaining = visiblePhotos();
  showLightboxPhotos(remaining, Math.min(previousIndex, remaining.length - 1));
};

function syncLightbox() {
  if (!lightbox.open || !lightboxTrack.clientWidth) return;
  const ready = visiblePhotos();
  const index = Math.round(lightboxTrack.scrollLeft / lightboxTrack.clientWidth);
  const button = ready[index];
  if (!button) return;
  previousPhoto.disabled = index === 0;
  nextPhoto.disabled = index === ready.length - 1;
  if (enlargedButton === button) return;
  enlargedButton = button;
  const card = button.closest('.result-card');
  syncShortlist(card);
  const total = shortlistOnly ? ready.length : resultGrid.children.length;
  const detail = card.querySelector('figcaption small');
  const count = shortlistOnly ? '备选 ' + (index + 1) + ' / ' + total
    : '第 ' + card.dataset.number + ' 张 / 共 ' + total + ' 张';
  lightbox.querySelector('.lightbox-count').textContent = count;
  const title = card.querySelector('figcaption strong').textContent;
  $('#enlarged-title').textContent = sampleContext.hidden ? title : '示例 · ' + title;
  $('#enlarged-detail').textContent = detail?.textContent || '';
  $('#enlarged-detail').hidden = !detail;
  sampleTools.hidden = sampleContext.hidden;
  if (!sampleTools.hidden) {
    originalPieces.replaceChildren(...resultPieces.get(card).map(piece => {
      const figure = document.createElement('figure');
      const img = new Image();
      img.alt = '';
      img.src = piece.url;
      const caption = document.createElement('figcaption');
      caption.textContent = piece.name;
      figure.append(img, caption);
      return figure;
    }));
  }
  lightbox.querySelector('.lightbox-nav').hidden = total < 2;
}

function showLightboxPhotos(ready, index) {
  lightboxTrack.replaceChildren();
  ready.forEach(addLightboxImage);
  if (!lightbox.open) {
    lightbox.returnValue = '';
    lightbox.showModal();
  }
  lightboxTrack.scrollLeft = index * lightboxTrack.clientWidth;
  syncLightbox();
}

function openLightbox(button) {
  openedPhoto = {button, saved:Boolean(button.closest('.result-card').querySelector('.shortlist-mark'))};
  const ready = visiblePhotos();
  showLightboxPhotos(ready, ready.indexOf(button));
}

sampleTools.querySelector('.sample-try').onclick = () => {
  syncLightbox();
  if (sampleContext.hidden || !enlargedButton) return;
  const pieces = resultPieces.get(enlargedButton.closest('.result-card'));
  applyReferenceSelection(pieces, () => {
    lightbox.close('use-sample');
    const pane = $('.setup');
    pane.querySelector('.generate-foot button').focus({preventScroll:true});
    if (matchMedia('(min-width:841px)').matches) pane.scrollTop = pane.scrollHeight;
    else pane.scrollIntoView({block:'end', behavior:'instant'});
  });
};

function stepLightbox(direction) {
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  lightboxTrack.scrollBy({left:direction * lightboxTrack.clientWidth, behavior});
}
previousPhoto.onclick = () => stepLightbox(-1);
nextPhoto.onclick = () => stepLightbox(1);
lightboxTrack.addEventListener('scroll', syncLightbox);
lightbox.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  stepLightbox(event.key === 'ArrowLeft' ? -1 : 1);
});
lightbox.addEventListener('close', () => {
  if (lightbox.open) return;
  if (enlargedButton?.isConnected && lightbox.returnValue !== 'use-sample') {
    enlargedButton.focus({preventScroll:true});
    const card = enlargedButton.closest('.result-card');
    const saved = Boolean(card.querySelector('.shortlist-mark'));
    if (enlargedButton !== openedPhoto?.button || saved !== openedPhoto?.saved) {
      card.scrollIntoView({block:'nearest', inline:'nearest'});
    }
  }
  lightboxTrack.replaceChildren();
  sampleOriginals.open = false;
  originalPieces.replaceChildren();
  enlargedButton = openedPhoto = null;
});

function resultCard(pieces) {
  const tops = pieces.filter(piece => piece.kind === 'top');
  const layered = tops.length > 1;
  const bottoms = pieces.filter(piece => piece.kind === 'bottom');
  const heading = layered ? describeLayerOrder(tops) : pieces.map(piece => piece.name).join(' ＋ ');
  const detail = layered && bottoms.length ? '下装 · ' + bottoms.map(piece => piece.name).join(' ＋ ') : '';
  const name = [heading, detail].filter(Boolean).join('，');
  const card = document.createElement('figure');
  card.className = 'result-card';
  card.dataset.number = resultGrid.children.length + 1;
  resultPieces.set(card, pieces);
  const stage = document.createElement('div');
  stage.className = 'result-photo result-pending';
  stage.textContent = '正在生成…';
  const caption = document.createElement('figcaption');
  const title = document.createElement('strong');
  title.textContent = heading;
  const minis = document.createElement('span');
  minis.className = 'result-miniatures';
  pieces.forEach(piece => {
    const img = new Image();
    img.src = piece.url;
    img.alt = '';
    minis.append(img);
  });
  caption.append(title);
  if (detail) {
    const description = document.createElement('small');
    description.textContent = detail;
    caption.append(description);
  }
  caption.append(minis);
  const number = document.createElement('span');
  number.className = 'result-number';
  card.append(number, stage, caption);
  resultGrid.append(card);
  return {name, stage, pieces};
}

async function loadResultImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function attachResultImage(card, img) {
  img.alt = card.name + '试穿效果';
  const open = button('', 'result-photo', () => openLightbox(open));
  open.setAttribute('aria-label', '放大查看' + card.name);
  const expand = document.createElement('span');
  expand.className = 'result-expand';
  expand.setAttribute('aria-hidden', 'true');
  expand.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"><path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M4 15.5V20h4.5"/></svg>';
  open.append(img, expand);
  card.stage.replaceWith(open);
  archiveResult(open.closest("figure"), img, card.name);
  updateCompareEntry();
  if (lightbox.open && !shortlistOnly) {
    addLightboxImage(open);
    syncLightbox();
  }
}

const sampleLook = referenceCases.find(look => look.sampleResults);
const samplePreview = $('.sample-preview');
const sampleContext = $('.sample-context');
let sampleLoad;
for (const piece of sampleLook.pieces) {
  const img = new Image();
  img.src = piece.url;
  img.alt = '';
  $('.sample-pieces').append(img);
}

function resetSampleEntry() {
  sampleLoad?.abort();
  sampleLoad = null;
  samplePreview.removeAttribute('aria-busy');
  $('#sample-call').textContent = '查看示例搭配';
  $('.sample-error').hidden = true;
}

function beginResultGroup(title, summary, sample = false) {
  if (lightbox.open) lightbox.close();
  if (compareDialog.open) compareDialog.close();
  resetSampleEntry();
  sampleContext.hidden = !sample;
  $('.batch-info h2').textContent = title;
  $('.batch-info p').textContent = summary;
  $('.results-empty').hidden = true;
  $('.result-batch').hidden = false;
  shortlistOnly = false;
  resultGrid.replaceChildren();
  resultView.scrollTop = 0;
}

samplePreview.onclick = async () => {
  if (lastBatch || sampleLoad) return;
  sampleLoad = new AbortController();
  const {signal} = sampleLoad;
  samplePreview.setAttribute('aria-busy', 'true');
  $('#sample-call').textContent = '正在打开…';
  $('.sample-error').hidden = true;
  let images;
  try {
    images = await Promise.all(sampleLook.sampleResults.map(look => loadResultImage(look.url)));
  } catch {
    if (!signal.aborted) {
      resetSampleEntry();
      $('.sample-error').hidden = false;
    }
    return;
  }
  if (signal.aborted) return;
  beginResultGroup('分别搭配', '2 件上衣分别搭配 1 条长裤', true);
  sampleLook.sampleResults.forEach((look, i) => attachResultImage(resultCard(look.pieces), images[i]));
  updateResultFilter();
  const status = $('.result-status');
  status.dataset.complete = 'true';
  status.textContent = '共 ' + images.length + ' 张';
  resultTab.focus({preventScroll:true});
};

for (const action of document.querySelectorAll('.go-fitting')) {
  action.onclick = () => {
    if (!sampleContext.hidden) {
      sampleContext.hidden = true;
      resultGrid.replaceChildren();
      updateResultFilter();
      $('.result-batch').hidden = true;
      $('.results-empty').hidden = false;
    }
    goSpace('styling');
  };
}

function encodeInput(url, batch) {
  if(typeof url==='string' && url.startsWith('data:image/jpeg;base64,'))return Promise.resolve(url.slice(23));
  if (!batch.encoded.has(url)) {
    const pending = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .94).split(',')[1];
    })();
    batch.encoded.set(url, pending);
  }
  return batch.encoded.get(url);
}

async function generateImage(card, batch) {
  const signal = batch.controller.signal;
  if(batch.onStage)return generateChatJob(card,batch);
  const person = await encodeInput(batch.portrait, batch);
  const garments = await Promise.all(card.pieces.map(async piece => ({
    category: piece.kind === 'bottom' ? 'bottoms' : 'tops',
    photoType: piece.photoType || 'auto',
    image: await encodeInput(piece.url, batch)
  })));
  const response = await fetch('/api/try-on', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({person, garments, preserve:Boolean(batch.preserve),requestText:batch.requestText||'普通服装试穿'}), signal
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error || '本次生成失败，可再点一次生成。');
  }
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException('Aborted','AbortError');
  const url = URL.createObjectURL(blob);
  batch.urls.push(url);
  return url;
}

async function encodeGarment(piece,batch){
  if(piece.file || (piece.visualVerification && piece.url.startsWith('blob:'))){
    const blob=piece.file || await (await fetch(piece.url)).blob();
    if(blob.size<=10*1024*1024 && ['image/jpeg','image/png','image/webp'].includes(blob.type)){
      const reader=new FileReader();
      return new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    }
  }
  return encodeInput(piece.url,batch);
}

async function generateChatJob(card,batch){
  const signal=batch.controller.signal;
  const aborted=()=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');};
  const detail=async response=>{
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||'暂时连接不上试穿任务，请重试。');
    return data;
  };
  let jobId=batch.jobId;
  if(jobId && batch.retryReview){
    await detail(await fetch('/api/try-on/jobs/'+jobId+'/review',{method:'POST',signal}));
  }
  if(!jobId){
    batch.onStage({status:'checking',message:'正在准备本人照和衣服素材…'});
    let person;
    if(batch.portraitFile?.name==='portrait.jpg' && batch.portraitFile.type==='image/jpeg' && batch.portraitFile.size<=10*1024*1024){
      const reader=new FileReader();
      person=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(batch.portraitFile);});
    }else person=await encodeInput(batch.portrait,batch);
    const garments=await Promise.all(card.pieces.map(async piece=>({category:piece.kind==='bottom'?'bottoms':'tops',photoType:piece.photoType||'auto',image:await encodeGarment(piece,batch)})));
    aborted();
    // Finish creation even if the user cancels, so the returned task can be cancelled too.
    const created=await detail(await fetch('/api/try-on/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,garments,portraitDimensions:batch.portraitDimensions,preserve:!!batch.preserve,requestText:batch.requestText||'普通服装试穿'})}));
    jobId=created.id;batch.onJob(jobId);
    if(signal.aborted){fetch('/api/try-on/jobs/'+jobId+'/cancel',{method:'POST'}).catch(()=>{});aborted();}
  }
  for(;;){
    aborted();
    const response=await fetch('/api/try-on/jobs/'+jobId,{signal});
    if(response.status===404||response.status===410){batch.onJob(null);throw new Error('这次试穿任务已过期，点重试会重新生成。');}
    const state=await detail(response);
    batch.onStage(state);
    if(state.status==='cancelled')throw new DOMException('Aborted','AbortError');
    if(state.status==='error'){if(state.code==='output_review_pending')batch.onReviewPending();else batch.onJob(null);throw new Error(state.error||'本次试穿未完成，请重试。');}
    if(state.status==='done'){
      const response=await fetch('/api/try-on/jobs/'+jobId+'/image',{signal});
      if(!response.ok)throw new Error('图片暂时无法读取，请重试。');
      const blob=await response.blob();aborted();
      const url=URL.createObjectURL(blob);batch.urls.push(url);return url;
    }
    await new Promise((resolve,reject)=>{
      const stop=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},1000);
      signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
    });
  }
}

async function showTryOnResults(outfits, modeName, summary, portraitFile) {
  const selection = JSON.stringify([modeName, outfits.map(look => look.map(piece => [piece.id, piece.kind]))]);
  if (lastBatch?.pending && lastBatch.selection === selection && lastBatch.portraitFile === portraitFile) {
    selectView(resultTab);
    resultTab.focus({preventScroll:true});
    return;
  }
  if (lastBatch) {
    lastBatch.controller.abort();
    if (lastBatch.pending) URL.revokeObjectURL(lastBatch.portrait);
    lastBatch.urls.forEach(url => URL.revokeObjectURL(url));
  }
  const batch = {controller:new AbortController(), urls:[], encoded:new Map(), portraitFile, selection, pending:true};
  lastBatch = batch;
  // Keep input URLs alive even when the user removes clothes or changes portraits mid-batch.
  const owned = new Map();
  function snapshotUrl(file, fallback) {
    if (!file) return fallback;
    if (!owned.has(file)) {
      const url = URL.createObjectURL(file);
      owned.set(file, url);
      batch.urls.push(url);
    }
    return owned.get(file);
  }
  batch.portrait = URL.createObjectURL(portraitFile);
  beginResultGroup(modeName, summary);
  const cards = outfits.map(pieces => resultCard(pieces.map(piece => ({
    ...piece, url:snapshotUrl(piece.file, piece.url)
  }))));
  updateResultFilter();
  selectView(resultTab);
  resultView.scrollTop = 0;
  resultTab.focus({preventScroll:true});
  const status = $('.result-status');
  status.dataset.complete = 'false';
  status.textContent = '正在生成 0 / ' + cards.length;
  let done = 0, failed = 0;
  for (const card of cards) {
    try {
      const url = await generateImage(card, batch);
      const img = await loadResultImage(url);
      if (batch.controller.signal.aborted) return;
      attachResultImage(card, img);
      done++;
    } catch (error) {
      if (batch.controller.signal.aborted) return;
      failed++;
      card.stage.textContent = error instanceof TypeError ? '未连接到本机生成服务，请稍后重试。' : error.message;

    }
    status.textContent = '已生成 ' + done + ' / ' + cards.length;
  }
  status.dataset.complete = String(!failed);
  status.textContent = failed ? '已生成 ' + done + ' 张 · ' + failed + ' 张未完成' : '共 ' + done + ' 张';
  batch.pending = false;
  URL.revokeObjectURL(batch.portrait);
  batch.portrait = null;
  batch.portraitFile = null;
  batch.encoded.clear();
}
