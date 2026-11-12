(() => {
  const looks = referenceCases;
  const referenceView = document.querySelector('#reference-view');
  const grid = referenceView.querySelector('.look-grid');
  const track = referenceView.querySelector('.look-track');
  const dots = referenceView.querySelector('.look-dots');
  const heading = referenceView.querySelector('#look-top');
  const filters = referenceView.querySelectorAll('.look-filters button');
  const zoom = referenceView.querySelector('.reference-zoom');
  const lightbox = document.querySelector('#reference-lightbox');
  const lightboxContent = lightbox.querySelector('.reference-lightbox-content');
  let active = looks[0];
  let visibleLooks = looks;
  let index = 0;
  let drag = null;
  let trackWidth = 0;
  let enlargedButton = null;
  let rotationTimer;
  let trackVisible = false;
  let touching = false;

  function canRotate() {
    return trackVisible && !document.hidden && track.clientWidth > 0 &&
      !lightbox.open && !drag && !touching && visibleLooks.length > 1;
  }

  function scheduleRotation() {
    clearTimeout(rotationTimer);
    if (canRotate()) {
      rotationTimer = setTimeout(() => {
        if (canRotate()) goTo(index + 1);
      }, 5000);
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function photo(url, alt, lazy = false) {
    const image = new Image();
    image.src = url;
    image.alt = alt;
    image.draggable = false;
    image.decoding = 'async';
    if (lazy) image.loading = 'lazy';
    return image;
  }

  function categoryLabel(look) {
    return look.category + ' · ' + (look.pieces.length > 1 ? '成套搭配' : '单件试穿');
  }

  function garmentRole(piece, pieces) {
    if (piece.kind === 'bottom') return '下装';
    const tops = pieces.filter(item => item.kind === 'top');
    return tops.length > 1 ? piece === tops[0] ? '内搭' : '外搭' : '上装';
  }

  function frame(content, caption, className = '') {
    const figure = element('figure', className);
    figure.append(content, element('figcaption', '', caption));
    return figure;
  }

  function originalFrame(look) {
    if (look.pieces.length === 1) {
      const piece = look.pieces[0];
      return frame(photo(piece.url, piece.name, true), '衣服原图');
    }
    const kit = element('div', 'garment-kit');
    kit.dataset.count = String(look.pieces.length);
    for (const piece of look.pieces) {
      const cell = element('div');
      cell.append(photo(piece.url, piece.name, true), element('span', '', garmentRole(piece, look.pieces)));
      kit.append(cell);
    }
    return frame(kit, '衣服原图 · ' + look.pieces.length + ' 件');
  }

  function comparisonSlide(look) {
    const slide = element('div', 'look-slide');
    slide.dataset.caseIndex = String(looks.indexOf(look));
    slide.append(originalFrame(look));
    const before = element('picture');
    before.append(photo(look.original, look.title + ' · 示例人物', true));
    const after = element('picture');
    // The same result is used in the gallery and large view so the case stays consistent.
    after.append(photo(look.result, look.title + ' · 试穿效果', true));
    const arrow = element('i', 'reference-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    slide.append(frame(before, '示例人物'), arrow, frame(after, '试穿效果'));
    return slide;
  }

  function updateDots() {
    const start = Math.floor(index / 5) * 5;
    const keepFocus = dots.contains(document.activeElement);
    dots.replaceChildren(...visibleLooks.slice(start, start + 5).map((look, offset) => {
      const position = start + offset;
      const dot = element('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', '第 ' + (position + 1) + ' 个示例，共 ' + visibleLooks.length + ' 个：' + look.title);
      dot.setAttribute('aria-current', String(position === index));
      dot.onclick = () => goTo(position);
      return dot;
    }));
    if (keepFocus) dots.querySelector('[aria-current="true"]')?.focus({preventScroll: true});
  }

  function markCurrent(next) {
    if (!visibleLooks.length) return;
    index = Math.max(0, Math.min(visibleLooks.length - 1, next));
    active = visibleLooks[index];
    heading.textContent = active.title + '的上身效果';
    zoom.setAttribute('aria-label', '查看' + active.title + '的对照大图');
    for (const [position, slide] of [...track.children].entries()) {
      slide.setAttribute('aria-hidden', String(position !== index));
    }
    for (const card of grid.children) {
      card.setAttribute('aria-pressed', String(Number(card.value) === looks.indexOf(active)));
    }
    updateDots();
  }

  function goTo(next) {
    if (!visibleLooks.length) return;
    markCurrent((next + visibleLooks.length) % visibleLooks.length);
    trackWidth = track.clientWidth;
    track.scrollTo({left: trackWidth * index, behavior: 'instant'});
    scheduleRotation();
  }

  function selectLook(look) {
    const next = visibleLooks.indexOf(look);
    if (next < 0) return;
    goTo(next);
    referenceView.scrollTo({top: 0, behavior: 'instant'});
    heading.focus({preventScroll: true});
  }

  function filterBy(category) {
    const visible = looks.filter(look => category === '全部' || look.category === category);
    if (!visible.length) return;
    visibleLooks = visible;
    track.replaceChildren(...visible.map(comparisonSlide));
    grid.replaceChildren(...visible.map(look => {
      const card = element('button', 'look-card');
      card.type = 'button';
      card.value = String(looks.indexOf(look));
      card.dataset.caseIndex = card.value;
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-controls', 'look-board');
      card.setAttribute('aria-label', look.title + '，' + categoryLabel(look) + '，查看示例');
      const print = element('span', 'case-print');
      print.append(photo(look.result, '', true));
      const caption = element('span', 'case-caption');
      const title = element('strong', '', look.title);
      title.title = look.title;
      const swatch = photo(look.swatch, look.title + '面料样本', true);
      swatch.className = 'case-swatch';
      caption.append(element('small', '', categoryLabel(look)), title, swatch);
      card.append(print, caption);
      card.onclick = () => selectLook(look);
      return card;
    }));
    for (const filter of filters) {
      filter.setAttribute('aria-pressed', String(filter.textContent.trim() === category));
    }
    goTo(Math.max(0, visible.indexOf(active)));
    referenceView.scrollTop = 0;
  }

  function openComparison(trigger) {
    enlargedButton = trigger;
    document.querySelector('#reference-lightbox-title').textContent = active.title + '的上身效果';
    const originals = element('section', 'reference-large-originals');
    originals.append(element('h3', '', '衣服原图' + (active.pieces.length > 1 ? ' · ' + active.pieces.length + ' 件' : '')));
    const pieces = element('div', 'reference-large-pieces');
    for (const piece of active.pieces) {
      pieces.append(frame(photo(piece.url, piece.name), piece.name));
    }
    originals.append(pieces);
    const person = element('section', 'reference-large-person');
    person.append(element('h3', '', '示例人物'), photo(active.original, active.title + ' · 示例人物'));
    const result = element('section', 'reference-large-result');
    result.append(element('h3', '', '试穿效果'), photo(active.result, active.title + ' · 试穿效果'));
    lightboxContent.replaceChildren(originals, person, result);
    lightbox.returnValue = '';
    if (!lightbox.open) lightbox.showModal();
    scheduleRotation();
    lightbox.scrollTop = 0;
    lightboxContent.scrollTop = 0;
    lightbox.querySelector('.reference-lightbox-close').focus({preventScroll: true});
  }

  zoom.onclick = () => openComparison(zoom);
  lightbox.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    lightbox.close();
  });
  lightbox.addEventListener('cancel', event => {
    event.preventDefault();
    event.stopPropagation();
    lightbox.close();
  });
  lightbox.addEventListener('pointerdown', event => event.stopPropagation());
  lightbox.addEventListener('click', event => {
    if (event.target !== lightbox) return;
    const bounds = lightbox.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) lightbox.close();
  });
  lightbox.addEventListener('close', () => {
    if (enlargedButton?.isConnected) enlargedButton.focus({preventScroll: true});
    enlargedButton = null;
    scheduleRotation();
  });

  referenceView.querySelector('.look-previous').onclick = () => goTo(index - 1);
  referenceView.querySelector('.look-next').onclick = () => goTo(index + 1);
  track.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    goTo(event.key === 'Home' ? 0 : event.key === 'End' ? visibleLooks.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1));
  };
  track.addEventListener('scroll', () => {
    if (!track.clientWidth || track.classList.contains('dragging')) return;
    const next = Math.max(0, Math.min(visibleLooks.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
    if (next !== index) markCurrent(next);
    scheduleRotation();
  });
  track.onpointerdown = event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = {x: event.clientX, left: track.scrollLeft};
    scheduleRotation();
    track.classList.add('dragging');
    track.setPointerCapture(event.pointerId);
  };
  track.onpointermove = event => {
    if (drag) track.scrollLeft = drag.left + drag.x - event.clientX;
  };
  track.onlostpointercapture = () => {
    if (!drag) return;
    drag = null;
    track.classList.remove('dragging');
    goTo(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
  };
  function updateTouch(event) {
    touching = event.touches.length > 0;
    scheduleRotation();
  }
  for (const type of ['touchstart', 'touchend', 'touchcancel']) {
    track.addEventListener(type, updateTouch, {passive: true});
  }
  new IntersectionObserver(entries => {
    trackVisible = entries[entries.length - 1].isIntersecting;
    scheduleRotation();
  }).observe(track);
  document.addEventListener('visibilitychange', scheduleRotation);
  new ResizeObserver(() => {
    if (track.clientWidth && track.clientWidth !== trackWidth) goTo(index);
  }).observe(track);
  referenceView.addEventListener('viewchange', () => {
    if (referenceView.hidden) {if (lightbox.open) lightbox.close();}
    else goTo(index);
  });
  matchMedia('(max-width:840px)').addEventListener('change', () => {if (lightbox.open) lightbox.close();});
  for (const filter of filters) filter.onclick = () => filterBy(filter.textContent.trim());
  filterBy('全部');
})();
