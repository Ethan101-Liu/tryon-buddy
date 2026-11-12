// The poster sets the layout. The cloth only deforms at the cuff while the tag is attached.
function attachPullTag(piece, poster, basename, reducedMotion) {
  const asset = part => 'pics/' + basename + '-' + part;
  piece.classList.add('fold-preview');
  piece.dataset.tagState = 'ready';
  piece.innerHTML = `
    <div class="fold-garment" data-view="still"><canvas class="cuff-pose" aria-hidden="true"></canvas></div>
    <div class="tag-rig">
      <svg class="tag-thread" width="1" height="1" aria-hidden="true"><path></path></svg>
      <button class="pull-tag" type="button" aria-label="拉一下，观看衬衫折叠和展开">
        <span class="tag-paper"><span>拉一下</span></span>
      </button>
    </div>`;
  const garment = piece.querySelector('.fold-garment');
  const rig = piece.querySelector('.tag-rig');
  const thread = rig.querySelector('path');
  const button = rig.querySelector('button');
  const canvas = garment.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const width = 344, height = 327;
  canvas.width = poster.width = width;
  canvas.height = poster.height = height;
  poster.className = 'shirt-still';
  poster.src = asset('open.webp?v=front-turn2');
  poster.draggable = false;
  garment.prepend(poster);

  const fabric = new Image();
  fabric.src = asset('tug.webp?v=tag1');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let progress = 0, tweenId = 0, cycle = 0;
  let gesture = null, skipClick = false, filmBlob = null;
  let fall = null, activeFilm = null;
  let pieceWidth = 0, pieceHeight = 0;

  function drawPull(value, moveThread = true) {
    progress = value;
    const hasFabric = ctx && fabric.complete && fabric.naturalWidth && !reducedMotion.matches;
    const pose = Math.round(value * 8);
    if (pose && hasFabric) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(fabric, pose % 3 * width, Math.floor(pose / 3) * height,
        width, height, 0, 0, width, height);
      garment.dataset.view = 'tug';
    } else if (garment.dataset.view === 'tug') {
      garment.dataset.view = 'still';
    }
    if (!moveThread) return;

    const tipX = hasFabric ? 4 * pieceWidth / width * pose / 8 : 0;
    const tipY = hasFabric ? 14 * pieceHeight / height * pose / 8 : 0;
    const slack = Math.min(21, Math.max(12, pieceWidth * .071));
    const eyeX = -4 + value * 4;
    const eyeY = slack + tipY + value * 7;
    const bend = (1 - value) * 9;
    thread.setAttribute('d', `M ${tipX} ${tipY} C ${tipX + bend} ${tipY + 3}, ${eyeX + bend} ${eyeY - 5}, ${eyeX} ${eyeY}`);
    rig.style.setProperty('--eye-x', eyeX + 'px');
    rig.style.setProperty('--eye-y', eyeY + 'px');
    rig.style.setProperty('--tag-angle', (-4 * (1 - value)) + 'deg');
  }
  function measure() {
    pieceWidth = garment.clientWidth;
    pieceHeight = garment.clientHeight;
    if (!fall) drawPull(progress);
  }
  new ResizeObserver(measure).observe(garment);
  fabric.addEventListener('load', measure);

  function tweenPull(to, duration, freezeThread = false) {
    const id = ++tweenId, from = progress, start = performance.now();
    // While the cuff relaxes the detached thread travels with the paper.
    return new Promise(resolve => {
      function frame(now) {
        if (id !== tweenId) return resolve();
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        drawPull(from + (to - from) * (1 - (1 - t) ** 2), !freezeThread);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function warmFilm() {
    if (reducedMotion.matches || filmBlob) return;
    filmBlob = fetch(asset('fold.webp?v=tag1')).then(response => {
      if (!response.ok) throw new Error('fold image');
      return response.blob();
    }).catch(() => { filmBlob = null; return null; });
  }
  button.addEventListener('pointerenter', warmFilm);
  button.addEventListener('focus', warmFilm);
  if (document.readyState === 'complete') warmFilm();
  else window.addEventListener('load', warmFilm, {once:true});

  function reset() {
    cycle++;
    tweenId++;
    button.removeAttribute('aria-disabled');
    piece.dataset.tagState = 'ready';
    garment.dataset.view = 'still';
    activeFilm?.remove();
    activeFilm = null;
    fall?.cancel();
    fall = null;
    drawPull(0);
  }

  async function playOnce() {
    if (piece.dataset.tagState !== 'ready') return;
    const id = ++cycle;
    button.setAttribute('aria-disabled', 'true');
    piece.dataset.tagState = 'tension';
    warmFilm();
    let objectURL;
    try {
      if (!reducedMotion.matches) await tweenPull(1, 50 + (1 - progress) * 120);
      if (id !== cycle) return;
      piece.dataset.tagState = 'released';
      if (!reducedMotion.matches) {
        fall = rig.animate([
          { transform:'translate(0,0) rotate(0deg)', opacity:1 },
          { transform:'translate(2px,7px) rotate(-7deg)', opacity:1, offset:.32 },
          { transform:'translate(7px,29px) rotate(-18deg)', opacity:.9, offset:.65 },
          { transform:'translate(11px,70px) rotate(-29deg)', opacity:0 }
        ], {duration:460, easing:'ease-in', fill:'forwards'});
        await tweenPull(0, 135, true);
      }
      if (id !== cycle) return;
      const still = reducedMotion.matches;
      const blob = !still && await filmBlob;
      if (id !== cycle) return;
      const film = new Image();
      film.alt = '';
      film.className = 'shirt-film';
      if (blob) {
        objectURL = URL.createObjectURL(blob);
        film.src = objectURL;
      } else {
        film.src = still ? asset('folded.webp') : asset('fold.gif?play=' + id);
      }
      try {
        await film.decode();
      } catch (error) {
        if (!objectURL || id !== cycle) throw error;
        filmBlob = null;
        film.src = asset('fold.gif?play=' + id);
        await film.decode();
      }
      if (id !== cycle) return;
      garment.append(film);
      activeFilm = film;
      garment.dataset.view = 'film';
      piece.dataset.tagState = 'playing';
      button.removeAttribute('title');
      // Both native animation files contain a single 5.73 s pass. A fresh source
      // on every pull also resets browsers that share an image animation clock.
      await wait(still ? 1100 : 5730);
    } catch {
      button.title = '再拉一次';
    } finally {
      if (id === cycle) {
        reset();
        if (!reducedMotion.matches) rig.animate(
          [{opacity:0, transform:'translateY(-3px)'}, {opacity:1, transform:'translateY(0)'}],
          {duration:230, easing:'ease-out'});
      }
      if (objectURL) URL.revokeObjectURL(objectURL);
    }
  }

  function cancelDrag() {
    if (!gesture) return;
    gesture = null;
    skipClick = true;
    if (piece.dataset.tagState === 'ready') tweenPull(0, 150);
  }
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || piece.dataset.tagState !== 'ready') return;
    warmFilm();
    tweenId++;
    skipClick = false;
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, moved:false,
      threshold:event.pointerType === 'touch' ? 16 : 20};
    button.setPointerCapture(event.pointerId);
  });
  function trackPointer(event) {
    if (event.pointerId !== gesture?.id) return;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(event.clientX - gesture.x, dy) > 5) gesture.moved = true;
    const threshold = gesture.threshold;
    drawPull(Math.max(0, Math.min(1, dy / threshold)));
    if (dy >= threshold) {
      gesture = null;
      skipClick = true;
      playOnce();
    }
  }
  window.addEventListener('pointermove', trackPointer);
  window.addEventListener('pointerup', event => {
    trackPointer(event);
    if (event.pointerId !== gesture?.id) return;
    if (gesture.moved) cancelDrag();
    else gesture = null;
  });
  window.addEventListener('pointercancel', event => {
    if (event.pointerId === gesture?.id) cancelDrag();
  });
  window.addEventListener('blur', cancelDrag);
  button.addEventListener('lostpointercapture', cancelDrag);
  button.addEventListener('click', event => {
    if (event.detail && skipClick) return;
    playOnce();
  });
  reducedMotion.addEventListener('change', () => { cancelDrag(); reset(); warmFilm(); });
  window.addEventListener('pagehide', () => { cancelDrag(); reset(); });
}
