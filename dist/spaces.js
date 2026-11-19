// Device-local collections for the front-end demo.
const spaceRecords = new Map();
const archiveFiles = new Map();
const pageBox = $('#space-page');
const spaceDialog = $('#space-dialog');
const sections = {closet:'我的衣服',history:'试穿记录',saved:'备选',styling:'试穿空间'};
let activeSpace = 'styling';
let noticeTimer;
function notice(message) {
  const node = $('#space-notice');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => node.hidden = true, 3200);
}
const spaceDB = new Promise((resolve,reject) => {
  const request = indexedDB.open('tryon-personal-space',1);
  request.onupgradeneeded = () => {
    for (const name of ['results','garments']) request.result.createObjectStore(name,{keyPath:'id'});
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function storeAction(store, action, value) {
  const db = await spaceDB;
  return new Promise((resolve,reject) => {
    const tx = db.transaction(store,action === 'getAll' ? 'readonly' : 'readwrite');
    const request = tx.objectStore(store)[action](...(value === undefined ? [] : [value]));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
function storageError(){notice('浏览器未能保存更改，刷新后可能无法恢复。');}
const spaceReady = storeAction('results','getAll').then(records=>{
  for(const row of records){
    if(spaceRecords.has(row.id)) continue;
    if(row.blob){archiveFiles.set(row.id,row.blob);row.url=URL.createObjectURL(row.blob);delete row.blob;}
    spaceRecords.set(row.id,row);
  }
}).catch(storageError);
function persistRecord(row) {
  const blob = archiveFiles.get(row.id);
  if(row.url.startsWith('blob:') && !blob) return;
  storeAction('results','put',{...row,url:blob ? '' : row.url,blob}).catch(storageError);
}
async function archiveResult(card,img,name){
  const sample = !sampleContext.hidden;
  const id = sample ? 'sample-'+card.dataset.number : 'try-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  card.dataset.archiveId=id;
  const row={id,name,number:card.dataset.number,url:img.src,date:Date.now(),sample,saved:false,owner:personalPhoto.account()};
  const blobPromise = img.src.startsWith('blob:') ? fetch(img.src).then(r=>r.blob()) : Promise.resolve(null);
  try {
    await spaceReady;
    const existing=spaceRecords.get(id);
    row.saved=existing ? existing.saved : Boolean(card.querySelector('.shortlist-mark'));
    spaceRecords.set(id,row);
    syncCardMark(card,row.saved);
    updateResultFilter();
    const blob=await blobPromise;
    if(blob){archiveFiles.set(id,blob);row.url=URL.createObjectURL(blob);}
    persistRecord(row);
    if(['history','saved'].includes(activeSpace)) drawSpace();
  } catch {storageError();}
}
function syncCardMark(card,saved){
  const mark=card.querySelector('.shortlist-mark');
  if(!saved){mark?.remove();return;}
  if(mark) return;
  const badge=el('span','shortlist-mark');
  badge.append(shortlistAction.querySelector('svg').cloneNode(true),'已加入备选');
  card.querySelector('figcaption strong').after(badge);
}
function setArchiveSaved(id,saved){
  const row=spaceRecords.get(id);
  if(!row) return;
  row.saved=saved;
  persistRecord(row);
  for(const card of resultGrid.children) if(card.dataset.archiveId===id) syncCardMark(card,saved);
  updateResultFilter();
}
function el(tag,cls,text){
  const node=document.createElement(tag);
  if(cls) node.className=cls;
  if(text!==undefined) node.textContent=text;
  return node;
}
function pic(src,name){
  const image=new Image();image.src=src;image.alt=name;return image;
}
function action(text,fn,primary=false){return button(text,primary?'space-main':'space-secondary',fn);}
function actions(...nodes){const bar=el('div','space-actions');bar.append(...nodes);return bar;}
function goSpace(key){
  if(!sections[key]) key='styling';
  if(location.hash.slice(1)!==key) location.hash=key;
  else showSpace(key);
}
function showSpace(key){
  if(['chat','studio','fitting'].includes(key)){key='styling';history.replaceState(history.state,'','#styling');}
  if(key==='home'){location.replace($('.home-link').href);return;}
  activeSpace=sections[key]?key:'styling';
  const chatting=activeSpace==='styling';
  $('.layoutA').classList.toggle('chat-layout',chatting);
  setMobileReference(false);
  pageBox.hidden=false;
  if(chatting)selectView(referenceTab);
  document.querySelectorAll('[data-space]').forEach(b=>{
    const top=!!b.closest('nav');
    const current=b.dataset.space===activeSpace;
    b.classList.toggle(top?'current':'active',current);
    if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  drawSpace();pageBox.scrollTop=0;
  if(innerWidth<=840)window.scrollTo(0,0);
}
document.querySelectorAll('[data-space]:not([data-space="account"])').forEach(b=>b.onclick=()=>goSpace(b.dataset.space));
window.addEventListener('hashchange',()=>showSpace(location.hash.slice(1)));
function dialog(title,...nodes){
  delete spaceDialog.dataset.closetItem;
  const body=el('div','space-dialog-body');body.append(el('h2','',title),...nodes);
  spaceDialog.replaceChildren(body);spaceDialog.setAttribute('aria-label',title);
  if(!spaceDialog.open)spaceDialog.showModal();
}
function closeBox(){spaceDialog.close();}
function gallery(parent){
  const grid=el('div','space-grid');parent.append(grid);return grid;
}
function tile(grid,{url,name,meta,buttons,garment=false,onPhoto}){
  const card=el('article','space-card'+(garment?' garment':''));
  const image=pic(url,name);
  if(onPhoto){const zoom=button('','space-photo',onPhoto);zoom.setAttribute('aria-label','查看'+name);zoom.append(image);card.append(zoom);}
  else card.append(image);
  const cap=el('div','space-caption');
  cap.append(el('small','',meta),el('h2','',name),actions(...buttons));card.append(cap);grid.append(card);
}
function changeSaved(row){
  const saved=!row.saved;
  setArchiveSaved(row.id,saved);
  closeBox();drawSpace();notice(saved?'已加入备选':'已从备选移除，仍可在试穿记录查看');
}
function review(row){
  dialog(row.name,pic(row.url,row.name),el('small','',resultMeta(row)),actions(
    ...(row.resume&&(row.owner??null)===personalPhoto.account()?[action('继续搭这套',()=>continueChatRecord(row),true)]:[]),
    action(row.saved?'保留备选':'加入备选',row.saved?closeBox:()=>changeSaved(row),true),
    ...(row.saved?[action('移出备选',()=>changeSaved(row))]:[]),action('关闭',closeBox)));
}
function resultMeta(row){return (row.sample?'示例试穿':new Date(row.date).toLocaleDateString('zh-CN'))+' · 原第 '+row.number+' 张';}
function recordsPage(wrap){
  const saved=activeSpace==='saved';
  const rows=[...spaceRecords.values()].filter(row=>(row.owner??null)===personalPhoto.account()&&(!saved||row.saved)).sort((a,b)=>b.date-a.date||Number(a.number)-Number(b.number));
  if(!rows.length){
    const empty=el('div','space-empty');empty.append(el('h2','',saved?'还没有备选搭配':'还没有试穿记录'),el('p','space-muted',saved?'打开一张试穿图，点「加入备选」就能在这里找到它。':'完成试穿后，可以在这里重新查看每张效果图。'),action('去试穿空间',()=>goSpace('styling')));wrap.append(empty);return;
  }
  const grid=gallery(wrap);
  if(saved && rows.length<=2)grid.classList.add('saved-pair');
  for(const row of rows){
    const buttons=saved?[action('移出备选',()=>dialog('移出这张备选？',el('p','',row.name+'仍会保存在试穿记录里。'),actions(action('保留备选',closeBox),action('确认移出',()=>changeSaved(row),true))))]:[action(row.saved?'已加入备选':'加入备选',()=>row.saved?review(row):changeSaved(row))];
    if(row.resume)buttons.unshift(action('继续搭这套',()=>continueChatRecord(row),true));
    tile(grid,{...row,meta:resultMeta(row),buttons,onPhoto:()=>review(row)});
  }
}
function showClosetItem(item){
  if(!personalWardrobe.items().includes(item))return;
  const controls=actions(action('试这件',()=>stageWardrobePiece(item),true),action('关闭',closeBox));
  if(personalWardrobe.canRemove(item)){
    const remove=action('从衣柜移除',()=>confirmClosetRemoval(item));
    remove.classList.add('closet-remove');
    controls.append(remove);
  }
  dialog(item.name,pic(item.url,item.name),controls);
  spaceDialog.dataset.closetItem=item.id;
}
function confirmClosetRemoval(item){
  if(!personalWardrobe.canRemove(item))return;
  const owner=personalPhoto.account();
  const cancel=action('取消',()=>showClosetItem(item));
  const confirm=action('确认移除',async()=>{
    if(confirm.disabled||!confirm.isConnected||!spaceDialog.open||activeSpace!=='closet')return;
    confirm.disabled=true;cancel.disabled=true;
    try{
      const removed=await personalWardrobe.remove(item);
      if(removed&&owner===personalPhoto.account()&&activeSpace==='closet')notice('已从衣柜移除「'+item.name+'」。');
    }catch{
      if(confirm.isConnected&&spaceDialog.open)notice('移除失败，请重试。');
    }finally{confirm.disabled=false;cancel.disabled=false;}
  },true);
  dialog('移除「'+item.name+'」？',el('p','','这件衣服会从衣柜和「更换单品」中移除，已保存的试穿图仍可查看。'),actions(cancel,confirm));
  spaceDialog.dataset.closetItem=item.id;
  cancel.focus({preventScroll:true});
}
window.addEventListener('tryon-wardrobe-removed',event=>{
  const id=event.detail.id;
  if(spaceDialog.open&&spaceDialog.dataset.closetItem===id)closeBox();
  if(garmentEditor?.selected?.id===id)garmentEditor.selected=null;
  if(activeSpace==='closet'||(activeSpace==='styling'&&garmentEditor?.tab==='closet'))drawSpace();
});
function closetPage(wrap){
  const input=el('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/webp';input.hidden=true;
  input.onchange=async()=>{
    const files=[...input.files],owner=personalPhoto.account(),session=chatRestoreToken;
    const current=()=>owner===personalPhoto.account()&&session===chatRestoreToken&&activeSpace==='closet';
    if(!files.length)return;
    try{for(const file of files)await checkUploadedImage(file,'garment');}
    catch(error){if(current())notice(error.message||'图片检查未完成，请重试。');return;}
    if(!current())return;
    const kind=el('select','space-input');
    for(const [value,label] of Object.entries(labels))kind.add(new Option(label,value));
    const save=action('保存衣物',async()=>{
      if(save.disabled||!current()||!spaceDialog.open||!kind.isConnected)return;
      save.disabled=true;
      try{
        const stored=await personalWardrobe.add(files,kind.value,owner);
        if(!stored||!current())return;
        if(kind.isConnected&&spaceDialog.open)closeBox();
        drawSpace();
      }catch{if(current())storageError();}
      finally{save.disabled=false;}
    },true);
    dialog('保存到我的衣服',el('p','',files.map(f=>f.name).join('、')),el('label','','衣物类别'),kind,actions(action('取消',closeBox),save));
    input.value='';
  };
  wrap.querySelector('.space-head').append(input,action('＋ 添加衣物',()=>input.click()));
  const grid=gallery(wrap);
  for(const item of personalWardrobe.items()){
    const select=()=>stageWardrobePiece(item);
    const zoom=()=>showClosetItem(item);
    tile(grid,{...item,meta:labels[item.kind],garment:true,onPhoto:zoom,buttons:[action('试这件',select)]});
  }
}
function drawSpace(){
  const focused=document.activeElement;
  const editing=pageBox.contains(focused)&&focused.matches('textarea,input')?{label:focused.getAttribute('aria-label'),start:focused.selectionStart,end:focused.selectionEnd}:null;
  const oldThread=pageBox.querySelector('.conv-thread');
  const scrollState=oldThread?{top:oldThread.scrollTop,follow:chatScrollToLatest||oldThread.scrollHeight-oldThread.clientHeight-oldThread.scrollTop<28}:null;
  const wrap=el('div','space-wrap'),head=el('div','space-head'),heading=el('div');
  const sub={saved:'集中回看已加入备选的试穿图。移出备选后，原图仍在试穿记录中。',history:'在这台设备上完成的试穿',closet:'选择已保存的单品，或添加自己的衣物。'};
  const title=el('h1','',sections[activeSpace]);

  heading.append(title);
  if(sub[activeSpace])heading.append(el('p','',sub[activeSpace]));
  head.append(heading);wrap.append(head);pageBox.replaceChildren(wrap);
  ({closet:closetPage,history:recordsPage,saved:recordsPage,styling:stylingPage})[activeSpace](wrap,scrollState);
  if(editing?.label&&!document.querySelector('dialog[open]')){
    const input=[...wrap.querySelectorAll('textarea,input')].find(node=>node.getAttribute('aria-label')===editing.label);
    if(input){input.focus({preventScroll:true});if(editing.start!==null)input.setSelectionRange(editing.start,editing.end);}
  }
}
const referenceToggle=$('#mobile-reference');
const referenceBoard=$('#workspace-reference');
function setMobileReference(open){
  if(!open)referenceBoard.querySelector('#reference-lightbox[open]')?.close();
  $('.layoutA').classList.toggle('mobile-ref-open',open);
  referenceToggle.setAttribute('aria-expanded',String(open));
  referenceBoard.hidden=!open&&activeSpace!=='styling';
  if(open){
    selectView(referenceTab);
    $('#look-top').focus({preventScroll:true});
  }
}
referenceToggle.onclick=()=>setMobileReference(referenceToggle.getAttribute('aria-expanded')!=='true');
function dismissOutsideReference(event){
  if(document.querySelector('dialog[open]'))return;
  if(referenceToggle.getAttribute('aria-expanded')==='true'&&
      !referenceBoard.contains(event.target)&&!referenceToggle.contains(event.target))setMobileReference(false);
}
document.addEventListener('pointerdown',dismissOutsideReference);
document.addEventListener('focusin',dismissOutsideReference);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&referenceToggle.getAttribute('aria-expanded')==='true'){
    setMobileReference(false);
    referenceToggle.focus({preventScroll:true});
  }
});
matchMedia('(max-width:840px)').addEventListener('change',()=>setMobileReference(false));
showSpace(location.hash.slice(1));
spaceReady.then(drawSpace);
