const conversation=[];
let chatDraft='', pendingPiece=null;
let chatAccount=personalPhoto.account();
let chatPhoto=null, photoRead=0, attachmentRead=0;
let chatGarmentUpload=null;
let garmentEditor=null;
let selectedOutfitTurn=null;
let chatScrollToLatest=false;
let chatPreferences=[],chatClarification=null,chatRestoring=true;
let chatMemoryOpen=false;
let chatSessionOwner=Symbol(),chatRestorePromise=Promise.resolve(),chatRestoreToken=0,chatSaveTimer,chatSaveChain=Promise.resolve();
let chatRevision=0;
let pristineReset=false;
const chatResetEventKey='tryon-chat-reset';
let chatOwnedUrls=[],chatSaveNotice=false;
const chatExpanded=new Set();
const chatOriginalViews=new Map();
// Browsing a version is temporary. Only a confirmed outfit choice is saved.
const comparisonViews=new WeakMap();
let chatOriginalReveal=null;
function findChatTurn(id){
  const visited=new Set();
  function visit(turn){if(!turn||visited.has(turn))return null;visited.add(turn);return turn.id===id?turn:visit(turn.baseTurn)||visit(turn.compareWith)||visit(turn.choiceTarget);}
  for(const turn of conversation){const found=visit(turn);if(found)return found;}return null;
}
function persistChatNow(){
  clearTimeout(chatSaveTimer);
  if(chatRestoring)return Promise.resolve();
  // An idle tab on the reset screen must not overwrite a new conversation
  // started in another tab when pagehide or a layout redraw triggers a save.
  if(pristineReset){
    if(!conversation.length&&!chatDraft&&!pendingPiece&&!chatPreferences.length&&!chatClarification)return Promise.resolve();
    pristineReset=false;
  }
  const owner=chatAccount,revision=chatRevision,guestPortrait=owner===null?currentPortrait:undefined;
  const packed=tryonChatCodec.pack({turns:conversation.slice(-40),selectedId:selectedOutfitTurn?.id,draft:chatDraft,pendingPiece,preferences:chatPreferences,clarification:chatClarification}).then(value=>({value}),error=>({error}));
  const next=chatSaveChain.catch(()=>{}).then(async()=>{
    const result=await packed;
    if(result.error)throw result.error;
    const saved=await tryonChatStore.save(owner,result.value,revision,guestPortrait);
    if(saved===false&&owner===chatAccount&&revision===chatRevision&&!chatRestoring)reloadResetConversation(owner);
  });
  chatSaveChain=next.catch(()=>{if(!chatSaveNotice){chatSaveNotice=true;storageError();}});return chatSaveChain;
}
function saveChatSoon(){if(!chatRestoring){clearTimeout(chatSaveTimer);chatSaveTimer=setTimeout(persistChatNow,180);}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistChatNow();});
window.addEventListener('pagehide',persistChatNow);
async function ensureChatSession(owner){
  if(chatSessionOwner===owner)return chatRestorePromise;
  chatSessionOwner=owner;chatRestoring=true;const token=++chatRestoreToken;
  chatRestorePromise=(async()=>{
    try{
      const {snapshot:saved,revision,guestPortrait}=await tryonChatStore.readSession(owner);
      if(owner!==chatAccount||token!==chatRestoreToken)return;
      chatRevision=revision;
      pristineReset=revision>0&&!saved;
      if(owner===null&&guestPortrait&&!currentPortrait)setPortrait(guestPortrait,URL.createObjectURL(guestPortrait));
      if(saved){
        const state=tryonChatCodec.unpack(saved);conversation.splice(0,conversation.length,...state.turns);
        chatOwnedUrls.push(...state.createdUrls);selectedOutfitTurn=findChatTurn(state.selectedId)||conversation.findLast(turn=>turn.photo)||null;
        chatDraft=state.draft||'';pendingPiece=state.pendingPiece||null;chatPreferences=(state.preferences||[]).filter(item=>item.key!=='exclude'||!/^(?:不要|不喜欢|避开|不想要)(?:了|它|这个|那个)?$/.test(item.value));chatClarification=state.clarification||null;
      }
    }catch{storageError();}
    finally{if(owner===chatAccount&&token===chatRestoreToken){chatRestoring=false;if(activeSpace==='styling')drawSpace();}}
  })();return chatRestorePromise;
}
function rememberChatPreferences(text){
  const groups=[['gender',/女装|女生|女士|男装|男生|男士|童装/],['occasion',/上班通勤|通勤|上班|周末出游|出游|日常|约会|看展/],['budget',/(?:预算|不超过|最多|以内|以下)[^，。；]{0,14}\d[^，。；]{0,10}|\d+\s*(?:元|块)?(?:以内|以下)/],['style',/简约|休闲|正式|复古|运动|极简/]];
  for(const [key,pattern] of groups){const value=text.match(pattern)?.[0];if(value&&!/不要|不喜欢|别/.test(text.slice(Math.max(0,text.indexOf(value)-3),text.indexOf(value)))){chatPreferences=chatPreferences.filter(item=>item.key!==key);chatPreferences.push({key,value});}}
  for(const value of text.match(/(?:不喜欢|不要|避开|不想要)[^，。；]{1,12}/g)||[]){if(/这件|那件|这条|那条|保留|不变|换|改|别动/.test(value)||/^(?:不要|不喜欢|避开|不想要)(?:了|它|这个|那个)?$/.test(value))continue;chatPreferences=chatPreferences.filter(item=>item.value!==value);chatPreferences.push({key:'exclude',value});}
  chatPreferences=chatPreferences.slice(-8);
}
function stopChatTurn(turn){
  turn.status='cancelled';turn.reply='已取消，本次结果不会加入搭配。可以调整要求后继续。';turn.controller?.abort();turn.running=false;
  if(turn.missingKind){
    turn.status='partial';turn.needsSearch=false;turn.reply='已停止补找，原先选中的衣服仍在这里。';
  }
  turn.controller=null;
  if(turn.jobId)fetch('/api/try-on/jobs/'+turn.jobId+'/cancel',{method:'POST'}).catch(()=>notice('已停止接收结果，后台任务暂时未确认取消。'));
  turn.jobId=null;
}
function cancelChatTurn(turn){
  if(!turn.running)return;
  stopChatTurn(turn);
  drawSpace();persistChatNow();
}
function stopChatWork(){
  clearTimeout(chatSaveTimer);
  attachmentRead++;
  if(chatGarmentUpload)URL.revokeObjectURL(chatGarmentUpload.piece.url);
  chatGarmentUpload=null;
  for(const turn of conversation)if(turn.running||turn.jobId)stopChatTurn(turn);
}
function clearChatContents(){
  const urls=new Set(chatOwnedUrls);
  for(const turn of conversation){
    urls.add(turn.photo);urls.add(turn.attachment?.url);
  }
  urls.add(pendingPiece?.url);
  for(const url of urls)if(url?.startsWith('blob:'))URL.revokeObjectURL(url);
  chatOwnedUrls=[];conversation.length=0;chatDraft='';pendingPiece=null;
  chatPreferences=[];chatMemoryOpen=false;chatClarification=null;
  selectedOutfitTurn=null;garmentEditor=null;chatScrollToLatest=false;
  chatExpanded.clear();chatOriginalViews.clear();chatOriginalReveal=null;
}
function reloadResetConversation(owner){
  if(owner!==chatAccount||owner!==personalPhoto.account())return;
  stopChatWork();clearChatContents();
  if(spaceDialog.open&&activeSpace==='styling')closeBox();
  chatSessionOwner=Symbol();
  const restore=ensureChatSession(owner);
  if(activeSpace==='styling')drawSpace();
  return restore;
}
async function resetChatSession(owner=chatAccount,expectedToken=chatRestoreToken){
  if(owner!==chatAccount||owner!==personalPhoto.account()||expectedToken!==chatRestoreToken)return false;
  const token=++chatRestoreToken,revision=chatRevision;
  chatRestoring=true;
  stopChatWork();
  try{
    const next=await tryonChatStore.reset(owner,revision,owner===null?currentPortrait:undefined);
    if(next!==null){
      // IndexedDB remains authoritative if this tab cannot notify its siblings.
      try{localStorage.setItem(chatResetEventKey,JSON.stringify({owner,revision:next}));}catch{}
    }
    if(owner!==chatAccount||owner!==personalPhoto.account()||token!==chatRestoreToken)return false;
    if(next===null){await reloadResetConversation(owner);return false;}
    clearChatContents();chatRevision=next;pristineReset=true;chatRestoring=false;
    if(spaceDialog.open)closeBox();
    if(activeSpace==='styling'){
      drawSpace();
      document.querySelector('.conv-compose textarea')?.focus({preventScroll:true});
    }
    return true;
  }catch{
    if(owner===chatAccount&&token===chatRestoreToken){
      chatRestoring=false;
      notice('对话未能重置，请重试。');
      if(activeSpace==='styling')drawSpace();
    }
    return false;
  }
}
function askResetChat(){
  if(chatRestoring||chatAccount!==personalPhoto.account())return;
  const owner=chatAccount,token=chatRestoreToken;
  const cancel=action('取消',closeBox),confirm=action('重置对话',async()=>{
    if(confirm.disabled)return;
    confirm.disabled=true;cancel.disabled=true;
    await resetChatSession(owner,token);
    // A failed reset can be retried from the toolbar.
    if(spaceDialog.open&&confirm.isConnected)closeBox();
  },true);
  dialog('重置当前对话？',el('p','','本次消息、待发内容和对话偏好将清空。本人照、衣柜和已保存的试穿记录会保留。'),actions(cancel,confirm));
  cancel.focus({preventScroll:true});
}
window.addEventListener('storage',event=>{
  if(event.key!==chatResetEventKey||!event.newValue)return;
  let reset;
  try{reset=JSON.parse(event.newValue);}catch{return;}
  if(reset?.owner===chatAccount&&reset.revision>chatRevision)reloadResetConversation(reset.owner);
});
function waitingPhotoTurn(){
  // A failed search or a clarification does not replace the last accepted outfit.
  const latest=conversation.findLast(turn=>turn.missingKind||turn.status==='waiting-photo'||turn.photo||turn.choiceTarget||
    (!turn.needsSearch&&turn.pieces?.length&&['checking','queued','generating','reviewing','error','cancelled'].includes(turn.status)));
  return latest?.status==='waiting-photo'?latest:null;
}
function waitingOutfitChange(){
  const waiting=waitingPhotoTurn();
  return waiting?.baseTurn?waiting:null;
}
function sameComparisonPiece(a,b){
  return a?.kind===b?.kind&&(a?.id||a?.sourceUrl||a?.url||a?.name)===(b?.id||b?.sourceUrl||b?.url||b?.name);
}
function comparisonBase(turn){
  if(!turn?.photo||!turn.pieces?.length||turn.choiceTarget)return null;
  // Archives already carry their own ancestry. Pending edits can sit between
  // two rendered versions; unrelated results elsewhere in the chat cannot.
  const seen=new Set([turn]);
  let before=turn.baseTurn||turn.compareWith;
  while(before&&!seen.has(before)){
    if(before.photo){
      if(!before.pieces?.length||before.photo===turn.photo)return null;
      const unchanged=turn.pieces.length===before.pieces.length&&turn.pieces.every((piece,i)=>sameComparisonPiece(piece,before.pieces[i]));
      return unchanged?null:before;
    }
    seen.add(before);before=before.baseTurn||before.compareWith;
  }
  return null;
}
function currentComparison(){
  return conversation.findLast(turn=>{
    const previous=comparisonBase(turn);
    return previous&&(selectedOutfitTurn===turn||selectedOutfitTurn===previous);
  });
}
function commitComparison(turn,side){
  if(chatRestoring||chatAccount!==personalPhoto.account()||!conversation.includes(turn)||
     conversation.some(item=>item.running)||!['previous','new'].includes(side))return false;
  const before=comparisonBase(turn);
  if(!before)return false;
  const target=side==='previous'?before:turn;
  if(turn.chosenSide===side&&selectedOutfitTurn===target&&!waitingPhotoTurn()){
    drawSpace();return true;
  }
  turn.chosenSide=side;
  chatOriginalViews.delete(turn.id);
  const version=side==='previous'?'换前':'换后';
  selectChatOutfit(target,'用'+version+'这版继续搭','已选'+version+'这版，接下来按这套搭配调整。');
  return true;
}
function selectChatOutfit(target,q='恢复上一套',message='已恢复这套，接下来会沿用它继续搭配。'){
  if(!target||(!target.photo&&target.status!=='waiting-photo')||conversation.some(turn=>turn.running))return;
  const waiting=waitingPhotoTurn();
  if(waiting&&waiting!==target){waiting.status='superseded';waiting.reply='这次换装已撤销。';}
  garmentEditor=null;chatClarification=null;chatScrollToLatest=true;
  const id='choice-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  if(!target.photo){
    conversation.push({...target,id,q,reply:'已恢复上一套待试穿搭配。',controller:null,running:false});
    drawSpace();persistChatNow();return;
  }
  selectedOutfitTurn=target;
  conversation.push({id,q,status:'choice',reply:message,choiceTarget:target,
    photo:target.photo,pieces:target.pieces,portraitFile:target.portraitFile,context:target.context,baseTurn:target.baseTurn});
  drawSpace();persistChatNow();
}
async function continueChatRecord(row){
  const owner=personalPhoto.account();
  if(!row.resume||(row.owner??null)!==owner)return;
  if(conversation.some(turn=>turn.running)){notice('请先等待当前试穿完成，或取消当前任务。');return;}
  if(owner!==chatAccount)return;
  const restore=ensureChatSession(owner),token=chatRestoreToken;
  await restore;
  if(owner!==chatAccount||owner!==personalPhoto.account()||token!==chatRestoreToken||chatRestoring)return;
  try{
    const state=tryonChatCodec.unpack(row.resume);chatOwnedUrls.push(...state.createdUrls);
    const target=state.turns.find(turn=>turn.id===state.selectedId)||state.turns.at(-1);
    if(!target?.photo||!target.pieces?.length)throw new Error('这张记录缺少续搭素材。');
    // The same archive can be opened twice in one chat. Give each restored graph its own IDs.
    const prefix='resume-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),seen=new Set();
    function scopeVersion(turn){
      if(!turn||seen.has(turn))return;
      seen.add(turn);turn.id=prefix+'-'+seen.size;
      scopeVersion(turn.baseTurn);scopeVersion(turn.compareWith);scopeVersion(turn.choiceTarget);
    }
    scopeVersion(target);
    target.baseTurn=target.baseTurn||target.compareWith;target.compareWith=null;target.chosenSide=null;
    target.q='继续搭这套';target.reply=target.outfitReason||'这套已恢复。告诉我想换哪件，我会保留其他单品。';
    conversation.push(target);selectedOutfitTurn=target;garmentEditor=null;chatClarification=null;
    if(spaceDialog.open)closeBox();goSpace('styling');drawSpace();persistChatNow();
  }catch(error){notice(error.message||'暂时无法恢复这套搭配。');}
}
async function refreshChatPhoto(){
  const owner=personalPhoto.account(),request=++photoRead;
  const switched=chatAccount!==owner;
  if(switched){
    if(spaceDialog.open)closeBox();
    if($('#popup').open)$('#popup').close();
    stopChatWork();
    persistChatNow();
    clearChatContents();chatAccount=owner;chatRevision=0;chatPhoto=null;
    setPortrait(null,null);
  }
  try{
    const restore=ensureChatSession(owner);
    const closet=personalWardrobe.load(owner).catch(storageError);
    if(switched)drawSpace();
    await Promise.all([restore,closet]);
    const file=await personalPhoto.get();
    if(request!==photoRead||owner!==personalPhoto.account())return;
    if(chatPhoto || file)setPortrait(file||null,file?URL.createObjectURL(file):null);
    chatPhoto=file;
    drawSpace();
    resumeChatWithPhoto();
  }catch{notice('暂时无法读取个人资料里的本人照。');}
}
window.addEventListener('tryon-profile-change',refreshChatPhoto);
window.addEventListener('storage',e=>{if(e.key===null||e.key?.startsWith('tryon-demo-profile'))refreshChatPhoto();});
document.addEventListener('DOMContentLoaded',refreshChatPhoto,{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)refreshChatPhoto();});
function latestTryOnRequest(){
  return conversation.findLast(turn=>turn.pieces?.length||turn.needsSearch||turn.jobId||turn.photo||turn.choiceTarget);
}
function partialOutfitTurn(){
  const turn=latestTryOnRequest();
  return turn?.missingKind?turn:null;
}
function missingPieceLabel(turn){
  if(turn.missingKind==='top')return '上衣';
  if(/裙/.test(turn.missingGarment||''))return '裙子';
  return /裤/.test(turn.missingGarment||'')?'裤子':'下装';
}
function completeMissingPiece(turn,piece){
  const kept=turn.pieces[0];
  turn.pieces=turn.missingKind==='top'?[piece,kept]:[kept,piece];
  turn.changedPieces=[piece];
  turn.filledKind=turn.missingKind;
  turn.outfitReason='保留了'+chatPieceDisplayName(kept)+'，配上'+chatPieceDisplayName(piece)+'。';
  delete turn.missingKind;delete turn.missingGarment;
  turn.needsSearch=false;
}
function continuePartialOutfit(partial,text=null,uploaded=null){
  if(!partial||partial!==partialOutfitTurn()||chatRestoring||chatAccount!==personalPhoto.account()||
      conversation.some(turn=>turn.running))return;
  const fromComposer=text!==null;
  const q=text?.trim()||(uploaded?'用这件'+labels[uploaded.kind]:'继续找'+missingPieceLabel(partial));
  const context=[partial.context];
  // A failed refinement is still the brief when the user simply presses "continue".
  if(partial.searchKind===partial.missingKind&&partial.searchQuery!=='继续找')context.push(partial.searchQuery);
  const turn={id:'turn-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
    q,context:[...new Set(context.filter(Boolean))].join('，').slice(-1500),searchQuery:fromComposer?q:'继续找',
    searchKind:partial.missingKind,missingKind:partial.missingKind,missingGarment:partial.missingGarment,
    pieces:[...partial.pieces],exclude:[...(partial.exclude||[])],replacementIndex:null,needsSearch:!uploaded,
    status:'searching',startedAt:Date.now(),reply:'正在补找'+missingPieceLabel(partial)+'…'};
  if(uploaded){turn.attachment=uploaded;completeMissingPiece(turn,uploaded);}
  if(fromComposer){chatDraft='';attachmentRead++;pendingPiece=null;}
  garmentEditor=null;chatClarification=null;chatScrollToLatest=true;
  conversation.push(turn);drawSpace();runChatTurn(turn);
}
let portraitBusy=false, pendingPortrait=null;
function askPersonalPhoto(turn){
  if(portraitBusy||chatPlanning)return;
  if(turn?.status==='waiting-photo'&&turn===waitingPhotoTurn()){
    // The newer request may have failed. Tapping this card explicitly selects
    // the earlier outfit; merely adding a profile photo must not select it.
    if(turn!==latestTryOnRequest())selectChatOutfit(turn,'试穿这套');
    if(currentPortrait){resumeChatWithPhoto();return;}
  }
  const owner=chatAccount,token=chatRestoreToken;
  const isCurrent=()=>personalPhoto.account()===owner&&chatAccount===owner&&chatRestoreToken===token;
  const file=el('input');file.type='file';file.accept='image/*,.heic,.heif';file.hidden=true;
  document.body.append(file);
  file.oncancel=()=>file.remove();
  file.onchange=async()=>{
    const selected=file.files[0];file.remove();
    if(!isCurrent()||!selected)return;
    portraitBusy=true;drawSpace();
    try{
      pendingPortrait=selectPortrait([selected],false,isCurrent);
      const saved=await pendingPortrait;
      if(!saved||!isCurrent())return;
      if(owner)await personalPhoto.put(saved);
      pristineReset=false;persistChatNow();resumeChatWithPhoto();
    }catch{notice('照片未保存，请重新选择。');}
    finally{pendingPortrait=null;portraitBusy=false;if(isCurrent())drawSpace();}
  };
  file.click();
}
function resumeChatWithPhoto(){
  if(chatRestoring||conversation.some(turn=>turn.running))return;
  const latest=latestTryOnRequest();
  if(!latest)return;
  if(['queued','checking','generating','reviewing','searching'].includes(latest.status)||
      (currentPortrait&&latest.status==='waiting-photo'))runChatTurn(latest);
}
function chatDownload(turn,label='下载图片'){
  const link=el('a','space-secondary',label);
  link.href=turn.photo;link.download='试穿效果.webp';
  return link;
}
function chooseComparedOutfit(text){
  const selection=text.split(/[，,。]/).find(part=>
    /选|用|留下|留着|保留|继续搭/.test(part)&&!/(?:不要|不用|别|不想|先不)(?:再)?(?:选|用|留|保留)/.test(part));
  if(!selection)return null;
  const comparison=currentComparison();
  if(!comparison)return null;
  const previous=comparisonBase(comparison);
  let chosen;
  if(/换前|旧版|上一[件条版套]|之前那[件条]|原来那[件条]|第一[件条]/.test(selection))chosen=previous;
  else if(/换后|新版|新发那[件条]|新发的|后一[件条]|第二[件条]/.test(selection))chosen=comparison;
  else if(/选|留下|留着|继续搭/.test(selection)){
    const color=selection.match(/米色|棕色|黑色|白色|蓝色|卡其|驼色/)?.[0];
    if(color){
      const matches=[previous,comparison].filter(turn=>{
        const item=turn.pieces[comparison.replacementIndex];
        return item&&(item.displayName||item.name||'').includes(color);
      });
      if(matches.length===1)chosen=matches[0];
    }
  }
  if(chosen){comparison.chosenSide=chosen===comparison?'new':'previous';selectedOutfitTurn=chosen;}
  return chosen;
}
function validChatGarmentKind(kind){return kind==='top'||kind==='bottom';}
function chatGarmentKindInText(text){
  const active=String(text||'').replace(/[_-]/g,' ').replace(/但是|不过|然后|同时/g,'，').split(/[，,。；;！？!?]/).filter(part=>!/(?:保留|留着|别动|不要动|不用换|不要换|别换|不换|不变|保持原样|保持不变|不想穿|不穿|不试|别穿|别试|不要这)/.test(part));
  const top=active.some(part=>/上衣|上装|外套|外搭|衬衫|毛衣|针织衫|针织开衫|卫衣|夹克|西装|西服|风衣|开衫|[Tt]恤|\b(?:tops?|shirts?|blouses?|coats?|jackets?|sweaters?|hoodies?)\b/i.test(part.replace(/(?:西装|西服|针织)(?:直筒|阔腿|休闲|运动|高腰|短|长)?(?:裤|裙)/g,'')));
  const bottom=active.some(part=>/裤|下装|裙|\b(?:pants|trousers|jeans|shorts|skirts?)\b/i.test(part));
  return top===bottom?null:top?'top':'bottom';
}
function singleGarmentRequest(text){
  if(/一套|整套|搭一身|搭配|配一条|配一件/.test(text)&&!/不需要搭配|不用搭配|不要搭配/.test(text))return null;
  if(!/换|试|穿|想要|来一|找/.test(text))return null;
  return chatGarmentKindInText(text);
}
function resolveChatGarmentKind(piece,text='',slotKind=null){
  if(validChatGarmentKind(slotKind)){piece.kind=slotKind;piece.kindSource='slot';}
  else if(piece.kindSource!=='manual'&&piece.kindSource!=='wardrobe'){
    const explicit=chatGarmentKindInText(text);
    if(explicit){piece.kind=explicit;piece.kindSource='text';}
  }
  return validChatGarmentKind(piece.kind)?piece.kind:null;
}
let chatPlanning=false;
async function submitChat(text, options={}){
  if(chatPlanning)return;
  const q=text.trim(),fromComposer=!options.baseTurn;
  if(chatAccount!==personalPhoto.account())return;
  if(fromComposer&&chatGarmentUpload){notice('图片正在检查，完成后再发送，衣服图和文字都会保留。');return;}
  const incoming=options.piece||(fromComposer?pendingPiece:null);
  if(chatRestoring||(!q&&!incoming)||conversation.some(turn=>turn.running))return;
  if(incoming&&!resolveChatGarmentKind(incoming,q,options.index===undefined?null:options.baseTurn?.pieces[options.index]?.kind)){
    if(fromComposer){drawSpace();requestAnimationFrame(()=>document.querySelector('.conv-picked select')?.focus());}
    notice('请选一下衣服是上装还是下装，也可以直接说“试穿这条裤子”。');return;
  }
  const partial=fromComposer?partialOutfitTurn():null;
  if(partial&&!/(?:重新搭|重搭|(?:再来|再看|换|另搭|另外搭)(?:一|整)?套|撤销|撤回|切回|换回|只试|只看)/.test(q)){
    const kind=incoming?.kind||chatGarmentKindInText(q);
    if(!kind||kind===partial.missingKind){continuePartialOutfit(partial,q,incoming);return;}
  }
  chatScrollToLatest=true;
  let resolved=q;
  if(fromComposer&&chatClarification&&!incoming){
    const kind=/上衣|上装|外套/.test(q)?'top':/下装|裤|裙/.test(q)?'bottom':null;
    if(kind&&/^(?:换|改|调整)?(?:上衣|上装|外套|下装|裤子|裙子)[吧。！!]*$/.test(q)){
      const other=kind==='top'?/裤|下装|裙/:/上衣|上装|外套|衬衫|毛衣|针织|卫衣|夹克/;
      resolved=chatClarification.q.split(/[，,。；;]/).filter(part=>!other.test(part)).join('，').replace(/这件|那件|这条|那条/g,kind==='top'?'上衣':'裤子').replace(/不要了|不喜欢/g,'换一件')+'，换'+(kind==='top'?'上衣':'裤子');
      options.baseTurn=findChatTurn(chatClarification.baseId)||selectedOutfitTurn;
    }
    chatClarification=null;
  }
  const waiting=waitingPhotoTurn();
  if(fromComposer&&!incoming&&/^(?:请|帮我|我想)?(?:看一?看|看看|看下|看一下|对比一下|对比)?(?:换前|换后|上一版|上一件|上一条|新版|旧版)(?:的|那版|这版|那件|那条|效果|上身图|上身效果|对比|对照)*[吧。？！!?]?$/.test(q)){
    const pair=currentComparison();
    if(!pair){notice('当前搭配还没有可对比的换装结果。');return;}
    chatDraft='';openChatComparison(pair,/换后|新版/.test(q)?'new':'previous');return;
  }
  const singleKind=singleGarmentRequest(q);
  const chosen=fromComposer&&!incoming&&!waiting?chooseComparedOutfit(q):null;
  const base=options.baseTurn?.choiceTarget||options.baseTurn||waiting||selectedOutfitTurn||conversation.findLast(turn=>turn.photo);
  const previous=conversation.at(-1);
  let intent=tryonIntent.analyze(resolved,{base,conversation,selectedOutfitTurn,pieceIndex:options.index});
  if(!base&&singleKind&&!incoming&&!chosen&&!['undo','restore'].includes(intent.action)){
    intent={action:base?'replace':'new',kind:singleKind,query:q};
  }else if(!incoming&&!chosen&&!['undo','restore'].includes(intent.action)){
    const owner=chatAccount, token=chatRestoreToken;
    chatPlanning=true;
    const sendButton=document.querySelector('.conv-send');
    if(sendButton){sendButton.disabled=true;sendButton.textContent='…';sendButton.setAttribute('aria-label','正在理解需求');}
    try{
      const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:resolved,context:base?.context||previous?.context||'',preferences:chatPreferences.map(item=>item.value),
          pieces:(base?.pieces||[]).map(piece=>({kind:piece.kind,name:chatPieceDisplayName(piece)})),targetIndex:options.index})});
      const data=await response.json();
      if(owner!==chatAccount||owner!==personalPhoto.account()||token!==chatRestoreToken)return;
      if(!response.ok)throw new Error(data.error||'千问暂时不可用，请重试。');
      intent=data;
    }catch(error){notice(error.message||'云端对话暂时不可用。');return;}
    finally{chatPlanning=false;if(sendButton?.isConnected){sendButton.textContent='↑';sendButton.setAttribute('aria-label','发送');sendButton.disabled=false;}}
  }
  // Slot-specific search filters should not become preferences for future outfits.
  rememberChatPreferences(q);
  if(!incoming&&options.index===undefined&&['undo','restore'].includes(intent.action)){
    const target=findChatTurn(intent.targetTurnId);
    if(target){
      if(intent.action==='undo'||!intent.kind||base.pieces.filter(piece=>piece.kind!==intent.kind).every(piece=>target.pieces.some(old=>old.id===piece.id))){
        if(fromComposer)chatDraft='';
        selectChatOutfit(target,q,'已恢复之前的搭配，原图直接沿用，不需要重新生成。');
      }else{
        const piece=target.pieces.findLast(item=>item.kind===intent.kind);
        submitChat(q,{baseTurn:base,index:base.pieces.findLastIndex(item=>item.kind===intent.kind),piece});
      }
      if(fromComposer){chatDraft='';drawSpace();}return;
    }
  }
  if(!incoming&&options.index===undefined&&intent.action==='clarify'){
    conversation.push({id:'question-'+Date.now().toString(36),q,status:'question',reply:intent.clarification,pieces:[],context:base?.context||q,choices:/上衣|下装/.test(intent.clarification)?['换上衣','换下装']:[]});
    chatClarification={q:resolved,baseId:base?.id};chatDraft='';garmentEditor=null;drawSpace();return;
  }
  if(chosen&&!incoming&&!['replace','again'].includes(intent.action)){
    selectChatOutfit(chosen,q,'好，接下来沿用选中的这套。还想调整哪件，继续告诉我。');chatDraft='';drawSpace();return;
  }
  if(base&&!incoming&&/^(?:以后|记住|我)?(?:不喜欢|不要|避开)[^，。]{1,14}[。！!]*$/.test(q)&&!intent.kind){
    conversation.push({id:'preference-'+Date.now().toString(36),q,status:'choice',reply:'记住了，接下来找款会避开这些要求。',pieces:[]});chatDraft='';drawSpace();return;
  }
  const again=intent.action==='again';
  let index=options.index,kind=index===undefined?undefined:(base?.pieces[index]?.kind||incoming?.kind);
  if(index===undefined&&base&&!again){kind=incoming?.kind||(intent.action==='replace'?intent.kind:null);if(kind)index=base.pieces.findLastIndex(piece=>piece.kind===kind);}
  const replacing=!!base&&!!kind;
  if(replacing&&!(index>=0))index=base.pieces.length;
  const context=(replacing||again)&&base?base.context:previous?.status==='question'?(previous.context||previous.q):q;
  const searchContext=[...new Set([context,...chatPreferences.map(item=>item.value)].filter(Boolean).join('，').split(/[，,]/).map(part=>part.trim()).filter(Boolean))].join('，').slice(-1500);
  const turn={id:'turn-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
    q:q||'试穿这件衣服',attachment:incoming,context:searchContext,searchQuery:intent.query||q,
    pieces:replacing?[...base.pieces]:[],needsSearch:!incoming,status:'searching',reply:'正在按你的需求找衣服…',startedAt:Date.now(),
    baseTurn:replacing?base:null,replacementIndex:replacing?index:null,basePhoto:replacing?base.photo:null,
    portraitFile:null,
    exclude:[...new Set([...(replacing?base.exclude||[]:[]),...(base?.pieces||[]).map(piece=>piece.sourceUrl).filter(Boolean)])]};
  if(!incoming&&!base&&previous?.status==='question'&&previous.clarificationKind)turn.replyingTo=previous.clarificationKind;
  if(replacing){turn.searchKind=kind;turn.changeSummary={replace:kind,keep:base.pieces.filter((piece,at)=>at!==index).map(piece=>chatPieceDisplayName(piece))};}
  else if(singleKind){turn.searchKind=singleKind;}
  else if(/只试|只看|只找/.test(q)){
    if(/上衣|上装|外套|衬衫|毛衣/.test(q))turn.searchKind='top';
    else if(/裤|下装|半裙/.test(q))turn.searchKind='bottom';
  }
  if(incoming){
    if(replacing)turn.pieces[index]=incoming;else turn.pieces=[incoming];
    turn.changedPieces=[incoming];
    if(!replacing&&/搭配|搭一套|配一/.test(q)){turn.needsSearch=true;turn.searchKind=incoming.kind==='top'?'bottom':'top';}
  }else if(!turn.replyingTo&&/^(你好|您好|嗨|在吗|hello)[！!？?。 .]*$/i.test(q)){
    turn.status='question';turn.reply='有看好的衣服，可以直接发图；还没挑好，告诉我场合和想穿的风格，我来帮你找。';
  }
  conversation.push(turn);garmentEditor=null;
  if(fromComposer){attachmentRead++;pendingPiece=null;chatDraft='';}
  drawSpace();if(turn.status!=='question')runChatTurn(turn);
}
async function sameChatPortrait(current,previous){
  if(!current||!previous)return false;
  if(current===previous)return true;
  if(!(current instanceof Blob)||!(previous instanceof Blob)||current.size!==previous.size)return false;
  // IndexedDB may return distinct File objects for the same photo.
  const [a,b]=await Promise.all([current.arrayBuffer(),previous.arrayBuffer()]);
  const bytes=new Uint8Array(b);
  return new Uint8Array(a).every((value,index)=>value===bytes[index]);
}
async function runChatTurn(turn){
  if(conversation.some(item=>item.running)||!conversation.includes(turn))return;
  if(turn.missingKind&&(!turn.needsSearch||turn!==partialOutfitTurn()))return;
  turn.running=true;const controller=turn.controller=new AbortController();
  const owner=chatAccount;
  const active=()=>conversation.includes(turn)&&chatAccount===owner&&personalPhoto.account()===owner&&turn.controller===controller&&!controller.signal.aborted;
  let portraitUrl;
  try{
    if(turn.needsSearch){
      turn.status='searching';turn.reply=turn.missingKind?'正在补找'+missingPieceLabel(turn)+'…':'正在按你的需求找衣服…';
      if(activeSpace==='styling')drawSpace();
      const response=await fetch('/api/search-garments',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:turn.controller.signal,
        body:JSON.stringify({reviewToken:turn.reviewToken,query:turn.searchQuery,context:turn.context,kind:turn.searchKind,exclude:turn.exclude,
          replyingTo:turn.replyingTo,completingOutfit:turn.missingKind?true:undefined,
          missingGarment:turn.missingKind?turn.missingGarment:undefined})
      });
      const data=await response.json().catch(()=>null);
      if(!active())return;
      turn.reviewToken=data?.reviewToken||null;
      if(data?.context)turn.context=data.context;
      if(turn.missingKind&&typeof data?.missingGarment==='string')turn.missingGarment=data.missingGarment;
      if(response.ok&&data?.clarification&&!turn.missingKind){
        turn.status='question';turn.reply=data.clarification;turn.choices=data.choices||[];
        turn.clarificationKind=data.clarificationKind;return;
      }
      if(!response.ok||!data?.pieces?.length){
        // Keep unsuccessful search filters, but do not reapply rejected input to a corrected request.
        if(turn.missingKind&&response.status>=400&&response.status<500&&
            !data?.missingGarment&&data?.code!=='no_verified_garment')turn.searchQuery='';
        throw new Error(data?.error||data?.clarification||'暂时没找到合适的衣服，请重试或发一张衣服截图。');
      }
      if(!active())return;
      if(data.missingKind){
        if(turn.searchKind||!validChatGarmentKind(data.missingKind)||data.pieces.length!==1||
            !validChatGarmentKind(data.pieces[0].kind)||data.pieces[0].kind===data.missingKind)throw new Error('返回的衣服类别不完整，请重新找款。');
        turn.pieces=[data.pieces[0]];turn.missingKind=data.missingKind;
        turn.missingGarment=data.queries?.find(item=>item.kind===data.missingKind)?.constraints?.garment;
        turn.needsSearch=false;turn.status='partial';
        turn.reply=chatPieceDisplayName(turn.pieces[0])+'找到了，还没找到符合要求的'+missingPieceLabel(turn)+'。';
        return;
      }
      if(turn.missingKind){
        if(data.pieces.length!==1||data.pieces[0].kind!==turn.missingKind)throw new Error('这次没找到对应类别的单品，可以继续找。');
        completeMissingPiece(turn,data.pieces[0]);
      }else if(turn.replacementIndex!==null){
        turn.pieces[turn.replacementIndex]=data.pieces[0];turn.changedPieces=[data.pieces[0]];
      }else turn.pieces.push(...data.pieces);
      if(!turn.baseTurn&&!turn.attachment&&typeof data.outfitReason==='string')turn.outfitReason=data.outfitReason.trim();
      turn.needsSearch=false;
    }
    if(!active())return;
    if(!turn.jobId && pendingPortrait){await pendingPortrait;if(!active())return;}
    let renderedBase=turn.baseTurn;
    while(renderedBase&&!renderedBase.photo)renderedBase=renderedBase.baseTurn;
    let samePerson=false;
    if(!turn.jobId){
      do{
        turn.portraitFile=currentPortrait||null;
        samePerson=renderedBase&&await sameChatPortrait(turn.portraitFile,renderedBase.portraitFile);
        if(!active())return;
      }while(turn.portraitFile!==(currentPortrait||null));
    }
    if(!turn.portraitFile&&!turn.jobId){
      const changed=turn.pieces[turn.replacementIndex];
      const kept=turn.changeSummary?.keep;
      turn.status='waiting-photo';turn.reply=changed&&kept?.length?
        kept.join('、')+'留着，'+labels[changed.kind]+'换成了'+chatPieceDisplayName(changed)+'。':(turn.outfitReason||'衣服选好了，可以继续换，也可以用本人照试穿。');
      return;
    }
    turn.status='checking';turn.reply='衣服已选好，正在准备试穿素材…';
    if(activeSpace==='styling')drawSpace();
    let garments=turn.pieces;
    if(!turn.jobId){
      turn.basePhoto=null;
      if(samePerson){
        // Several slots may have changed while waiting. Compare the final outfit
        // with the last rendered image, not just the most recent edited slot.
        const changes=turn.pieces.filter((piece,i)=>!(piece.id&&piece.id===renderedBase.pieces[i]?.id));
        if(changes.length){turn.basePhoto=renderedBase.photo;garments=changes;}
      }
    }
    if(turn.portraitFile)portraitUrl=URL.createObjectURL(turn.portraitFile);
    // A single garment should target its own region, including on the first try-on.
    const preserveOtherClothes = Boolean(turn.basePhoto) || garments.length === 1;
    let portraitDimensions;
    if( !turn.jobId && portraitUrl){
      const original=new Image();original.src=portraitUrl;await original.decode();
      portraitDimensions=[original.naturalWidth,original.naturalHeight];
    }
    const batch={retryReview:!!turn.outputReviewPending,onReviewPending:()=>{turn.outputReviewPending=true;},portraitFile:turn.basePhoto?null:turn.portraitFile,portraitDimensions,portrait:turn.basePhoto||portraitUrl,preserve:preserveOtherClothes,requestText:[turn.context,turn.searchQuery].join(' '),encoded:new Map(),controller:turn.controller,urls:[],jobId:turn.jobId,
      onJob:id=>{if(active()){turn.jobId=id;persistChatNow();}},
      onStage:state=>{
        if(!active())return;
        const changed=turn.status!==state.status;turn.status=state.status;turn.progress=state.progress;turn.reply=state.message||turn.reply;
        if(activeSpace==='styling'){
          const answer=document.querySelector('[data-turn="'+turn.id+'"]');
          if(changed||!answer)drawSpace();
          else{answer.querySelector('[role="status"]').textContent=turn.reply;const progress=answer.querySelector('.conv-progress');if(progress)progress.textContent=chatProgressText(turn);}
        }
        if(changed)persistChatNow();
      }};
    const url=await generateImage({pieces:garments},batch);
    if(!active()){URL.revokeObjectURL(url);return;}
    turn.outputReviewPending=false;turn.photo=url;turn.status='done';turn.jobId=null;turn.progress=null;
    selectedOutfitTurn=turn;
    turn.reply=comparisonBase(turn)?'这套已试好，可以对比换前和换后的效果。':(turn.outfitReason||'先看这一套。哪里想换，继续告诉我就好。');
    try{
      const blob=await fetch(url).then(response=>response.blob());
      if(!active())return;
      const resume=await tryonChatCodec.pack({turns:[turn],selectedId:turn.id,preferences:chatPreferences});
      if(!active())return;
      const record={id:'chat-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name:turn.pieces.map(piece=>piece.displayName||piece.name).join(' + '),number:1,
        url:URL.createObjectURL(blob),date:Date.now(),sample:false,saved:false,owner, resume};
      archiveFiles.set(record.id,blob);spaceRecords.set(record.id,record);persistRecord(record);
    }catch{storageError();}
  }catch(error){
    if(turn.controller!==controller||!conversation.includes(turn)||chatAccount!==owner)return;
    if(turn.missingKind&&!turn.reviewToken&&!turn.outputReviewPending){
      turn.status='partial';turn.needsSearch=false;
      turn.reply=error instanceof TypeError?'暂时连不上找款服务，已选的衣服仍在这里。':error.message;
      return;
    }
    if(error.name==='AbortError'){turn.jobId=null;if(turn.status!=='cancelled'){turn.status='cancelled';turn.reply='本次试穿已取消，可以调整要求后继续。';}return;}
    turn.status='error';turn.reply=error instanceof TypeError?'暂时连接不上生成服务，请重试。':error.message;
  }finally{
    if(portraitUrl)URL.revokeObjectURL(portraitUrl);
    if(turn.controller===controller&&chatAccount===owner){
      turn.running=false;persistChatNow();
      if(conversation.includes(turn)&&activeSpace==='styling')drawSpace();
    }
  }
}
function copyWardrobePiece(item){
  // Chat owns its URL: switching closets or removing a draft can revoke either preview independently.
  return {...item,url:item.file?URL.createObjectURL(item.file):item.url,
    origin:'wardrobe',kindSource:validChatGarmentKind(item.kind)?'wardrobe':'unknown'};
}
async function stageWardrobePiece(item){
  const owner=personalPhoto.account();
  if(owner!==chatAccount||!personalWardrobe.items().includes(item))return;
  const request=++attachmentRead;
  if(chatGarmentUpload){
    URL.revokeObjectURL(chatGarmentUpload.piece.url);
    chatGarmentUpload=null;
  }
  await ensureChatSession(owner);
  if(request!==attachmentRead||owner!==chatAccount||owner!==personalPhoto.account()||
      activeSpace!=='closet'||location.hash!=='#closet'||!personalWardrobe.items().includes(item))return;
  if(pendingPiece)URL.revokeObjectURL(pendingPiece.url);
  pendingPiece=copyWardrobePiece(item);
  garmentEditor=null;
  chatClarification=null;
  if(spaceDialog.open)closeBox();
  goSpace('styling');
  persistChatNow();
}

async function readChatGarment(files,target=null){
    if(!files.length)return;
    if(files.length>1){notice('每次先发一张衣服图。');return;}
    const file=files[0];
    if(!file.type.startsWith('image/')){notice('请上传衣服图片，例如 JPG、PNG 或 WebP。');return;}
    const request=++attachmentRead,owner=personalPhoto.account(),url=URL.createObjectURL(file);
    if(chatGarmentUpload)URL.revokeObjectURL(chatGarmentUpload.piece.url);
    if(pendingPiece&&!target){URL.revokeObjectURL(pendingPiece.url);pendingPiece=null;}
    const slotKind=target?.baseTurn.pieces[target.index]?.kind;
    const piece={id:url,name:file.name.replace(/\.[^.]+$/,'')||'上传的衣物',url,file,origin:'upload',kind:validChatGarmentKind(slotKind)?slotKind:null,kindSource:validChatGarmentKind(slotKind)?'slot':'unknown'};
    chatGarmentUpload={request,owner,piece,target};
    if(activeSpace==='styling')drawSpace();
    try{
      const metadata=await checkUploadedImage(file,'garment');
      if(metadata.photoType)piece.photoType=metadata.photoType;
      const image=new Image();image.src=url;await image.decode();
      if(request!==attachmentRead||owner!==personalPhoto.account()){URL.revokeObjectURL(url);return;}
      if(piece.kindSource!=='manual'&&!validChatGarmentKind(slotKind)){
        const detected=validChatGarmentKind(metadata?.garmentKind)?metadata.garmentKind:null;
        const filename=chatGarmentKindInText(file.name);
        piece.kind=detected||filename;piece.kindSource=detected?'image':filename?'filename':'unknown';
      }
      resolveChatGarmentKind(piece,chatDraft,slotKind);
      chatGarmentUpload=null;
      if(target&&!chatRestoring&&!conversation.some(turn=>turn.running)){submitChat('换成这件'+labels[piece.kind],{...target,piece});return;}
      if(pendingPiece&&pendingPiece!==piece)URL.revokeObjectURL(pendingPiece.url);
      pendingPiece=piece;
      if(activeSpace==='styling')drawSpace();
      saveChatSoon();
    }catch(error){
      URL.revokeObjectURL(url);
      if(request!==attachmentRead||owner!==personalPhoto.account())return;
      chatGarmentUpload=null;notice(error.message||'图片无法读取，请重新选择。');if(activeSpace==='styling')drawSpace();
    }
  }

function openGarmentEditor(turn,index,anchorTurn=turn){
  garmentEditor={turn,index,anchorTurn,tab:'closet',selected:null,query:''};
  drawSpace();
}
function garmentReplacementTray(){
  const editor=garmentEditor,turn=editor.turn,piece=turn.pieces[editor.index];
  const tray=el('section','conv-replace');
  tray.setAttribute('aria-label','更换'+piece.name);
  const head=el('div','conv-replace-head');
  head.append(el('strong','','换一件'+labels[piece.kind]),action('收起',()=>{garmentEditor=null;drawSpace();}));
  const tabs=el('div','conv-replace-tabs');
  for(const [key,label] of [['closet','我的衣服'],['search','让 AI 找']]){
    const tab=action(label,()=>{editor.tab=key;drawSpace();});
    tab.setAttribute('aria-pressed',String(editor.tab===key));tabs.append(tab);
  }
  const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.hidden=true;
  upload.onchange=()=>readChatGarment(upload.files,{baseTurn:turn,index:editor.index});
  tabs.append(action('发一张图',()=>upload.click()),upload);tray.append(head,tabs);
  if(editor.tab==='closet'){
    const choices=personalWardrobe.items().filter(item=>item.kind===piece.kind&&item.id!==piece.id);
    const list=el('div','conv-replace-options');
    for(const item of choices){
      const choice=button('','conv-garment-option',()=>{
        if(garmentEditor!==editor||chatAccount!==personalPhoto.account()||!personalWardrobe.items().includes(item))return;
        editor.selected=item;drawSpace();
      });
      choice.setAttribute('aria-pressed',String(editor.selected?.id===item.id));
      choice.append(pic(item.url,item.name),el('span','',item.name));list.append(choice);
    }
    if(!choices.length)list.append(el('p','','衣柜里还没有其他同类单品，可以发图或让 AI 找。'));
    const use=action('用这件试穿',()=>{
      if(garmentEditor!==editor||chatAccount!==personalPhoto.account()||!personalWardrobe.items().includes(editor.selected))return;
      submitChat('换成'+editor.selected.name,{baseTurn:turn,index:editor.index,piece:copyWardrobePiece(editor.selected)});
    },true);
    use.disabled=!choices.includes(editor.selected);tray.append(list,use);
  }else{
    const form=el('form','conv-replace-search'),field=el('input');
    field.placeholder=piece.kind==='bottom'?'例如，浅色直筒裤':'例如，米色短外套';
    field.setAttribute('aria-label','想换的单品要求');field.value=editor.query;
    field.oninput=()=>editor.query=field.value;
    const find=el('button','space-main','帮我找并试穿');find.type='submit';
    form.onsubmit=event=>{event.preventDefault();submitChat('换成'+(field.value.trim()||labels[piece.kind]),{baseTurn:turn,index:editor.index});};
    form.append(field,find);tray.append(form);
  }
  return tray;
}
function tryOnPhoto(turn){
  const photo=button('','conv-look',()=>dialog('试穿效果',pic(turn.photo,'本人试穿效果'),actions(chatDownload(turn),action('关闭',closeBox))));
  photo.setAttribute('aria-label','放大试穿效果');photo.append(pic(turn.photo,'本人试穿效果'));
  return photo;
}
function originalViewFor(anchorTurn){
  const selected=chatOriginalViews.get(anchorTurn.id);
  if(!selected)return null;
  const candidate=[anchorTurn,comparisonBase(anchorTurn)].find(item=>item?.id===selected.candidateId);
  const piece=candidate?.pieces[selected.index];
  if(!candidate?.photo||!piece?.url){chatOriginalViews.delete(anchorTurn.id);return null;}
  return {candidate,piece,index:selected.index};
}
function chatPieceDisplayName(piece,originalTitle=false){
  const source=originalTitle&&piece.sourceUrl?(piece.sourceTitle||piece.originalTitle||piece.name):null;
  const name=String(source||piece.displayName||piece.name||'').trim();
  if(!originalTitle&&piece.kind==='bottom'&&piece.constraints?.requiredFeatures?.includes('直筒')&&
     /直筒|straight[ -]?(leg|fit)/i.test(piece.sourceTitle||piece.name)&&!name.includes('直筒')&&piece.displayName){
    return name.replace(/(牛仔裤|休闲裤|西裤|长裤|短裤|裤子)$/,'直筒$1');
  }
  const uploaded=!piece.sourceUrl&&(piece.origin==='upload'||piece.file);
  const mechanical=/^(?:IMG|IMAGE|DSC\w*|PXL|PHOTO|SCREEN[ _-]?SHOT|PASTED[ _-]?IMAGE|截屏|截图|屏幕截图|微信图片|微信截图|照片|图片)[\s_.-]*[\w\s_.:-]*$/i.test(name)||/^[a-f\d-]{24,}$/i.test(name);
  return !name||uploaded&&mechanical?'你上传的'+(labels[piece.kind]||'衣服'):name;
}
function isProductDetail(url){
  const host=url.hostname.toLowerCase(),path=url.pathname;
  const numericItemId=/^[1-9]\d*$/.test(url.searchParams.get('id')||'');
  if(['item.taobao.com','detail.tmall.com','detail.tmall.hk','h5.m.taobao.com'].includes(host)){
    return numericItemId&&/^\/(?:awp\/core\/detail|item)\.htm\/?$/i.test(path);
  }
  if(['www.taobao.com','world.taobao.com'].includes(host))return /^\/(?:list\/)?item\/\d+\.htm\/?$/i.test(path);
  if(['detail.1688.com','m.1688.com'].includes(host))return /^\/offer\/\d+\.html?\/?$/i.test(path);
  if(host==='item.jd.com')return /^\/\d+\.html\/?$/i.test(path);
  if(host==='item.m.jd.com')return /^\/product\/\d+\.html\/?$/i.test(path);
  if(host==='tao.hooos.com')return /^\/goods_[a-z\d_-]+\.html$/i.test(path);
  if(['www.etsy.com','etsy.com'].includes(host))return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?listing\/[1-9]\d*(?:\/[^/]+)?\/?$/i.test(path);
  if(host==='www2.hm.com')return /\/productpage\.\d+\.html$/i.test(path);
  if(host==='www.uniqlo.com')return /\/products\/E\d{6}(?:-\d+)?(?:\/\d+)?\/?$/i.test(path);
  if(host==='www.woodlandworldwide.com')return /^\/product\/[a-z\d-]+-\d+\/?$/i.test(path);
  return false;
}
function similarGarmentTerms(piece){
  const title=String(piece.sourceTitle||piece.name||'').trim();
  const details=piece.constraints||{};
  const advertisedBrand=title.match(/^([\p{L}\d·&-]{2,16})(?=新品|旗舰店|官方)/u)?.[1];
  const brand=piece.brand||advertisedBrand;
  const audienceNames={children:'童装',men:'男装',women:'女装',neutral:'中性'};
  const verified=piece.audienceVerification;
  const audience=audienceNames[verified?.ageGroup==='children'?'children':verified?.gender]||
    audienceNames[details.audience]||piece.searchQuery?.match(/^(童装|男装|女装)\s/)?.[1];
  const item=piece.displayName||(details.garment&&(details.color||'')+details.garment)||
    title.split(/[|｜!！?？_]/)[0].trim().slice(0,55);
  if(!item)return '';
  return [brand,audience].filter(word=>word&&!item.includes(word)).concat(item).join(' ');
}
function garmentShoppingLink(piece){
  let source=null;
  if(typeof piece.sourceUrl==='string'){
    try{
      const parsed=new URL(piece.sourceUrl);
      if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)source=parsed;
    }catch{ /* Older records may not contain a usable web address. */ }
  }
  if(source&&isProductDetail(source)&&piece.sourceStatus!=='unavailable'){
    return {label:'查看商品',href:source.href};
  }
  // Only web-sourced or built-in pieces have reliable search terms. A personal
  // upload without a source may have a filename that would disclose private data.
  const catalogImage=/^(?:\.\/|\/)?(?:img\/|assets\/lookbook\/)/.test(piece.url||'');
  if(!source&&(piece.file||piece.origin==='upload'||!catalogImage))return null;
  // Retain the garment keywords from older marketplace searches.
  const queryKey=source?.hostname==='s.taobao.com'?'q':source?.hostname==='tao.hooos.com'?'w':null;
  const savedQuery=queryKey&&source.pathname==='/search'?source.searchParams.get(queryKey)?.trim():null;
  const terms=savedQuery||similarGarmentTerms(piece);
  if(!terms)return null;
  const search=new URL('https://tao.hooos.com/search');
  search.searchParams.set('w',terms);
  return {label:'找相似款',href:search.href};
}
function appendGarmentShoppingLink(parent,piece){
  const link=garmentShoppingLink(piece);
  if(!link)return;
  const anchor=el('a','',link.label);
  anchor.href=link.href;anchor.target='_blank';anchor.rel='noopener noreferrer';
  parent.append(anchor);
}
function showChatOriginal(candidate,index,anchorTurn=candidate){
  if(!candidate?.photo||!candidate.pieces[index]?.url)return;
  chatOriginalViews.set(anchorTurn.id,{candidateId:candidate.id,index});chatExpanded.add(anchorTurn.id);
  chatOriginalReveal={anchorId:anchorTurn.id,active:true,focused:false};
  drawSpace();
}
function settleChatOriginalReveal(thread,reveal){
  if(!reveal)return false;
  // A user gesture releases this render's positioning, including its late image callback.
  if(!reveal.active)return true;
  const answer=Array.from(thread.querySelectorAll('.conv-answer')).find(item=>item.dataset.turn===reveal.anchorId);
  const panel=answer?.querySelector(reveal.selector||'.conv-original-comparison');
  if(!panel){reveal.active=false;return true;}
  thread.scrollTop+=panel.getBoundingClientRect().top-thread.getBoundingClientRect().top-8;
  if(!reveal.focused){panel.focus({preventScroll:true});reveal.focused=true;}
  return true;
}
function originalComparisonContent(anchorTurn,selection){
  const {candidate,piece,index}=selection;
  const previous=comparisonBase(anchorTurn),comparing=previous&&comparisonViews.has(anchorTurn);
  const panel=el('section','conv-original-comparison');panel.tabIndex=-1;
  panel.setAttribute('aria-label','商品原图与本人上身对照');
  const head=el('div','conv-original-head');
  head.append(el('strong','','原图与上身对照'),action(comparing?'返回换前换后':'返回搭配',()=>{
    chatOriginalViews.delete(anchorTurn.id);
    if(comparing)openChatComparison(anchorTurn,candidate===previous?'previous':'new');else drawSpace();
  }));
  panel.append(head);
  if(comparing){
    const versions=el('div','conv-original-versions');versions.setAttribute('role','group');versions.setAttribute('aria-label','选择对照的版本');
    for(const [label,version] of [['换前',previous],['换后',anchorTurn]]){
      const choice=action(label,()=>showChatOriginal(version,Math.min(index,version.pieces.length-1),anchorTurn));
      choice.setAttribute('aria-pressed',String(candidate===version));versions.append(choice);
    }
    panel.append(versions);
  }
  if(candidate.pieces.length>1){
    const tabs=el('div','conv-original-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','选择要对照的单品');
    for(const [pieceIndex,item] of candidate.pieces.entries()){
      const tab=button('','conv-original-tab',()=>showChatOriginal(candidate,pieceIndex,anchorTurn));
      const name=chatPieceDisplayName(item);
      tab.type='button';tab.title=chatPieceDisplayName(item,true);tab.setAttribute('aria-pressed',String(pieceIndex===index));
      tab.append(pic(item.url,name),el('span','',name));tabs.append(tab);
    }
    panel.append(tabs);
  }
  const pair=el('div','conv-original-pair');
  const original=el('figure','conv-original-card'),worn=el('figure','conv-original-card');
  const originalName=chatPieceDisplayName(piece,true),caption=el('small','',originalName);caption.title=originalName;
  const image=button('','conv-original-image',()=>dialog(originalName,pic(piece.url,originalName),action('关闭',closeBox)));
  image.type='button';image.setAttribute('aria-label','放大'+originalName+'的商品原图');image.append(pic(piece.url,originalName));
  original.append(el('figcaption','','商品原图'),image,caption);
  const versionLabel=comparing?(candidate===anchorTurn?'换后 · ':'换前 · '):'';
  worn.append(el('figcaption','',versionLabel+'本人上身'),tryOnPhoto(candidate));pair.append(original,worn);panel.append(pair);
  const controls=el('div','conv-original-actions');
  appendGarmentShoppingLink(controls,piece);
  if(!comparing){
    const change=action('更换这件'+labels[piece.kind],()=>openGarmentEditor(candidate,index,anchorTurn));
    change.disabled=conversation.some(turn=>turn.running);controls.append(change);
  }
  if(controls.childElementCount)panel.append(controls);
  return panel;
}
function openChatComparison(turn,side='new'){
  if(!comparisonBase(turn))return;
  comparisonViews.set(turn,side);
  chatOriginalViews.delete(turn.id);chatExpanded.add(turn.id);garmentEditor=null;
  chatOriginalReveal={anchorId:turn.id,selector:'.conv-comparison',active:true,focused:false};
  drawSpace();
}
function comparisonContent(turn,previous){
  const panel=el('section','conv-comparison');panel.tabIndex=-1;
  panel.setAttribute('aria-label','换前换后对比');
  const head=el('div','conv-compare-head');
  const close=action('收起',()=>{
    comparisonViews.delete(turn);
    chatOriginalReveal={anchorId:turn.id,selector:'.conv-compare-entry',active:true,focused:false};
    drawSpace();
  });
  head.append(el('strong','','换前换后'),close);
  const toggle=el('div','conv-compare-toggle');toggle.setAttribute('role','group');toggle.setAttribute('aria-label','切换预览版本');
  const pair=el('div','conv-compare-pair');
  panel.dataset.previewSide=comparisonViews.get(turn);
  for(const [side,label,candidate,other] of [['previous','换前',previous,turn],['new','换后',turn,previous]]){
    const tab=button(label,'',()=>{
      // Leave both frames mounted so changing the preview preserves its position and focus.
      comparisonViews.set(turn,side);panel.dataset.previewSide=side;
      for(const option of toggle.children)option.setAttribute('aria-pressed',String(option===tab));
    });
    tab.type='button';tab.dataset.side=side;tab.setAttribute('aria-pressed',String(panel.dataset.previewSide===side));toggle.append(tab);
    const changed=candidate.pieces.filter(piece=>!other.pieces.some(item=>sameComparisonPiece(item,piece)));
    const name=changed.map(piece=>chatPieceDisplayName(piece)).join('、')||'原有搭配';
    const card=el('section','conv-compare-card');card.dataset.side=side;card.setAttribute('aria-label',label+' · '+name);
    const title=el('div','conv-compare-title');title.append(el('small','',label),el('span','',name));title.title=name;
    const photo=tryOnPhoto(candidate);photo.setAttribute('aria-label','放大'+label+'试穿效果');
    const choose=action('用这版继续搭',()=>{
      comparisonViews.delete(turn);chatOriginalViews.delete(turn.id);
      commitComparison(turn,side);
    });
    choose.classList.add('conv-compare-choice');choose.setAttribute('aria-label','用'+label+'这版继续搭');
    choose.disabled=conversation.some(item=>item.running);
    card.append(title,photo,choose);
    if(changed.length){
      const original=action('原图对照',()=>showChatOriginal(candidate,candidate.pieces.indexOf(changed[0]),turn));
      original.classList.add('conv-compare-original');card.append(original);
    }
    pair.append(card);
  }
  panel.append(head,toggle,pair);return panel;
}
function chatProgressText(turn){
  const p=turn.progress;
  return p?'第 '+p.currentGarment+' / '+p.totalGarments+' 件 · 生成步骤 '+p.step+' / '+p.totalSteps:turn.status==='queued'?'任务已排队，可以先整理下一条需求。':turn.status==='reviewing'?'正在检查生成图片。':'完成后会直接显示在这条对话里。';
}
function pieceChangeMarker(turn,piece,index){
  if(turn.chosenSide==='previous')return null;
  if(turn.filledKind)return piece.kind===turn.filledKind?{type:'added',label:'本次补齐'}:{type:'kept',label:'已保留'};
  const baseline=turn.compareWith||turn.baseTurn;
  if(!baseline?.pieces)return null;
  if(piece.id&&baseline.pieces.some(previous=>previous.id===piece.id))return {type:'kept',label:'已保留'};
  if(index!==turn.replacementIndex||!turn.changedPieces?.some(changed=>changed.id===piece.id))return null;
  const previous=baseline.pieces[index];
  return previous?.kind===piece.kind?{type:'changed',label:'本次更换'}:{type:'added',label:'本次加入'};
}
function stylingPage(wrap,scrollState){
  const follow=chatScrollToLatest||scrollState?.follow!==false;
  const originalReveal=chatOriginalReveal;chatOriginalReveal=null;
  if(originalReveal){
    const release=()=>{originalReveal.active=false;};
    for(const type of ['wheel','touchstart','pointerdown','keydown','input'])wrap.addEventListener(type,release,{passive:true});
  }
  wrap.classList.add('conversation');wrap.classList.toggle('started',!!conversation.length);
  wrap.querySelector('.space-head').remove();
  const thread=el('div','conv-thread');thread.setAttribute('role','log');thread.setAttribute('aria-label','试穿对话');
  const partial=partialOutfitTurn();
  const pending=partial?null:waitingPhotoTurn();
  const pendingMessage=pending&&conversation.findLast(turn=>turn===pending||turn.choiceTarget===pending);
  const busy=conversation.some(turn=>turn.running);
  if(conversation.length){
    const state=el('div','conv-current');
    if(partial){
      state.classList.add('is-pending');
      state.append(pic(partial.pieces[0].url,''),el('span','','搭配中 · 还差'+labels[partial.missingKind]));
    }else if(pending){
      state.classList.add('is-pending');
      const current=el('span','','待试穿 · '+pending.pieces.length+' 件单品');
      current.title=pending.pieces.map(piece=>chatPieceDisplayName(piece)).join(' / ');
      if(pending.pieces.length)state.append(pic((pending.changedPieces?.at(-1)||pending.pieces[0]).url,''));
      state.append(current);
    }else if(selectedOutfitTurn?.photo){const current=el('span','','当前搭配 · '+selectedOutfitTurn.pieces.length+' 件单品');current.title=selectedOutfitTurn.pieces.map(piece=>piece.displayName||piece.name).join(' / ');state.append(pic(selectedOutfitTurn.photo,'当前搭配'),current);}
    else state.append(el('span','','试穿对话'));
    const undo=action('撤销上次修改',()=>submitChat('撤销'));
    undo.disabled=conversation.some(turn=>turn.running)||!(waitingOutfitChange()||selectedOutfitTurn?.baseTurn);
    const reset=button('','conv-reset',askResetChat);
    reset.type='button';reset.title='重置对话';reset.setAttribute('aria-label','重置对话');
    reset.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v5h-5"/><path d="M19.5 10a7.5 7.5 0 1 0 .1 4.3"/></svg>';
    reset.disabled=chatRestoring;
    state.append(undo,reset);wrap.append(state);
  }
  if(!conversation.length){
    const welcome=el('div','conv-intro');
    let title='有看好的衣服吗？',hint='有图就发来试穿，没挑好就说说要去哪儿。';
    if(chatRestoring){
      title='正在恢复试穿空间…';hint='照片和搭配只保存在这台设备的浏览器中。';
    }else if(pendingPiece?.origin==='wardrobe'){
      title='试试这件衣服？';hint='可以直接发送，也可以说说想怎么搭。';
    }
    welcome.append(el('h1','',title),el('p','',hint));
    thread.append(welcome);
  }
  const submit=submitChat;
  const latest=conversation.at(-1);
  const activeResult=partial||pendingMessage||(latest?.photo?latest:latest?.choiceTarget||conversation.findLast(turn=>turn.photo));
  for(const turn of conversation){
    const q=el('div','conv-question',turn.q);
    if(turn.attachment)q.append(pic(turn.attachment.url,turn.attachment.name));
    const answer=el('article','conv-answer');answer.dataset.turn=turn.id;
    const editable=turn===pendingMessage;
    const incomplete=!!turn.missingKind&&turn.pieces.length>0;
    answer.classList.toggle('has-outfit',!!turn.photo);
    answer.classList.toggle('pending-outfit',editable);
    answer.classList.toggle('partial-outfit',incomplete);
    const reply=el('p','',turn.reply);reply.setAttribute('role','status');
    answer.append(el('strong','','试穿搭子'),reply);
    if(turn.changeSummary&&!turn.photo&&!editable&&(turn.baseTurn||turn.compareWith)){answer.append(el('div','conv-change-summary','仅替换'+labels[turn.changeSummary.replace]+(turn.changeSummary.keep.length?' · 保留 '+turn.changeSummary.keep.join('、'):'')));}
    if(turn.running&&!incomplete){
      const activity=el('div','conv-activity');
      const phases=['searching','checking','generating','reviewing'];
      const current=turn.status==='queued'?1:phases.indexOf(turn.status);
      const stages=el('div','conv-stages');
      ['找衣服','素材就绪','试穿生成','结果检查'].forEach((label,index)=>{const step=el('span',index===current?'is-current':index<current?'is-complete':'',label);stages.append(step);});
      activity.append(stages,el('small','conv-progress',chatProgressText(turn)));answer.append(activity);
    }
    const previous=comparisonBase(turn);
    const comparing=previous&&comparisonViews.has(turn);
    const outfitTurn=previous&&turn.chosenSide==='previous'?previous:turn;
    const result=el('div','conv-result'),originalView=originalViewFor(turn);
    if(originalView){result.classList.add('is-original-comparison');result.append(originalComparisonContent(turn,originalView));}
    else if(comparing){result.classList.add('is-comparison');result.append(comparisonContent(turn,previous));}
    else if(previous){
      const preview=el('div','conv-version-preview');
      const compare=button('对比换前','conv-compare-entry',()=>openChatComparison(turn,turn.chosenSide||'new'));
      compare.type='button';compare.setAttribute('aria-expanded','false');
      preview.append(tryOnPhoto(outfitTurn),compare);result.append(preview);
    }
    else if(turn.photo)result.append(tryOnPhoto(turn));
    const detail=el('section','conv-outfit');detail.setAttribute('aria-label','本套单品');
    detail.append(el('h3','',incomplete?'已找到的单品':editable?'已选单品':'这套用了'));
    for(const [index,piece] of outfitTurn.pieces.entries()){
      const row=el('div','conv-item');row.dataset.pieceId=piece.id;
      row.classList.toggle('is-selected',garmentEditor?.anchorTurn===turn&&garmentEditor.index===index);
      const info=el('div','conv-item-info'),heading=el('div','conv-item-heading'),name=el('strong','',chatPieceDisplayName(piece));name.title=chatPieceDisplayName(piece,true);
      heading.append(name);
      const marker=pieceChangeMarker(turn,piece,index);
      if(marker){const badge=el('span','conv-item-badge',marker.label);badge.dataset.change=marker.type;row.dataset.change=marker.type;heading.append(badge);}
      const origin=piece.sourceName|| (piece.origin==='upload'?'你发的':'我的衣服');
      info.append(heading,el('small','',origin));
      const links=el('div','conv-item-links');
      const inspect=()=>turn.photo?showChatOriginal(outfitTurn,index,turn):dialog(piece.name,pic(piece.url,piece.name),action('关闭',closeBox));
      links.append(action(turn.photo?'原图对照':'原图',inspect));
      appendGarmentShoppingLink(links,piece);
      info.append(links);
      const thumbnail=button('','conv-item-thumbnail',inspect);thumbnail.type='button';thumbnail.setAttribute('aria-label',(turn.photo?'对照':'查看')+piece.name+'的原图');thumbnail.append(pic(piece.url,piece.name));
      row.append(thumbnail,info);
      if(!incomplete){
        const isBottom=piece.kind==='bottom';
        const noun=isBottom?(/裙/.test(chatPieceDisplayName(piece))?'裙子':'裤子'):'上衣';
        const another=isBottom?'再找一条':'再找一件';
        const change=editable?action(another,()=>{
          if(waitingPhotoTurn()===pending)submitChat(another+noun,{baseTurn:pending,index});
        }):action('更换',()=>openGarmentEditor(outfitTurn,index,turn));
        change.setAttribute('aria-label',editable?another+noun:'更换'+piece.name);
        change.disabled=busy||(!editable&&!turn.photo);row.append(change);
      }
      detail.append(row);
    }
    if(outfitTurn.pieces.length&&!comparing){
      if(turn.running&&!incomplete){
        const materials=el('div','conv-materials');
        for(const piece of outfitTurn.pieces){const item=el('div');item.append(pic(piece.url,piece.name),el('span','',piece.displayName||piece.name));materials.append(item);}answer.append(materials);
      }else if(!originalView)result.append(detail);
    }
    if(result.children.length)answer.append(result);
    if(turn.photo&&(originalView||!comparing)&&(originalView?[originalView.piece]:outfitTurn.pieces).some(piece=>garmentShoppingLink(piece)?.label==='查看商品')){
      answer.append(el('small','conv-source-note','价格、尺码和库存请以商品页为准。'));
    }
    if(garmentEditor?.anchorTurn===turn)answer.append(garmentReplacementTray());
    const commands=actions();
    if(turn===partial&&!turn.reviewToken){
      const more=action('继续找'+missingPieceLabel(turn),()=>continuePartialOutfit(turn),true);
      more.disabled=busy;commands.append(more);
    }
    if(editable){
      const photo=action('用我的照片试穿',()=>askPersonalPhoto(pending),true);
      photo.disabled=busy;commands.append(photo);
    }
    if((!incomplete||turn.reviewToken)&&['error','cancelled'].includes(turn.status)){
      const retry=action(turn.reviewToken||turn.outputReviewPending?'重试审核':'重试',()=>runChatTurn(turn));retry.disabled=conversation.some(item=>item.running);commands.append(retry);
    }
    if(turn===conversation.at(-1))for(const choice of turn.choices||[])commands.append(action(choice,()=>submit(choice)));
    if(turn.photo&&!comparing){
      const visibleOutfit=originalView?.candidate||outfitTurn;
      const again=action('再来一套',()=>submit('再来一套',{baseTurn:outfitTurn}));again.disabled=conversation.some(item=>item.running);
      commands.append(chatDownload(visibleOutfit),again);
    }
    answer.append(commands);
    const earlierPending=incomplete&&turn!==partial||!editable&&!turn.photo&&turn.pieces.length&&['waiting-photo','superseded'].includes(turn.status);
    if((earlierPending||turn.photo&&turn!==activeResult)&&garmentEditor?.anchorTurn!==turn){
      const older=el('details','conv-older'),summary=el('summary');older.open=chatExpanded.has(turn.id);
      summary.append(pic(turn.photo||turn.pieces.at(-1).url,''),el('span','',turn.q),el('small','','查看这轮'));
      older.append(summary,q,answer);older.ontoggle=()=>{if(older.open)chatExpanded.add(turn.id);else chatExpanded.delete(turn.id);};thread.append(older);
    }else thread.append(q,answer);
  }
  const composer=el('form','conv-compose'),input=el('textarea');
  input.rows=1;input.placeholder=partial?'说说想找什么样的'+missingPieceLabel(partial)+'…':pending?'想换什么颜色或版型？':
    latest?.status==='question'&&latest.clarificationKind==='occasion'&&!pendingPiece?'直接说行程，或点上面的选项…':'说说想怎么穿，或拖入衣服图…';
  input.setAttribute('aria-label','试穿或搭配需求');input.value=chatDraft;
  const attach=el('input');attach.type='file';attach.accept='image/jpeg,image/png,image/webp';attach.hidden=true;
  const running=conversation.find(turn=>turn.running);
  const enter=el('button','conv-send',running?'■':'↑');enter.type=running?'button':'submit';enter.title=running?'取消生成':'发送';enter.setAttribute('aria-label',enter.title);
  if(running){enter.classList.add('is-stop');enter.onclick=()=>cancelChatTurn(running);}
  function updateInput(){
    chatDraft=input.value;
    const needsKind=pendingPiece&&!validChatGarmentKind(pendingPiece.kind)&&!chatGarmentKindInText(chatDraft);
    enter.disabled=chatRestoring||chatPlanning||(portraitBusy&&!!currentPortrait)||(!running&&(!!chatGarmentUpload||needsKind||(!chatDraft.trim()&&!pendingPiece)));
    input.style.height='auto';input.style.height=Math.min(100,input.scrollHeight)+'px';
  }
  input.oninput=()=>{updateInput();saveChatSoon();};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();composer.requestSubmit();}};
  composer.onsubmit=e=>{e.preventDefault();if(!enter.disabled)submit(input.value);};
  attach.onchange=()=>readChatGarment(attach.files);
  const dragMessage=el('span','conv-drop-message','松开添加衣服图');
  composer.ondragover=e=>{if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';composer.classList.add('drag-over');}};
  composer.ondragleave=e=>{if(!composer.contains(e.relatedTarget))composer.classList.remove('drag-over');};
  composer.ondrop=e=>{e.preventDefault();composer.classList.remove('drag-over');readChatGarment(e.dataTransfer.files);};
  const attached=chatGarmentUpload?.piece||pendingPiece;
  if(attached){
    const checking=!!chatGarmentUpload,chosen=el('div','conv-picked'),copy=el('div','conv-attachment-copy');
    chosen.classList.toggle('is-unclassified',!validChatGarmentKind(attached.kind));chosen.setAttribute('aria-busy',String(checking));
    const preview=button('','conv-attachment-preview',()=>dialog(attached.name,pic(attached.url,attached.name),action('关闭',closeBox)));
    preview.type='button';preview.setAttribute('aria-label','放大待发送衣服图');preview.append(pic(attached.url,attached.name));
    const status=checking?'正在检查图片…':!validChatGarmentKind(attached.kind)?'请确认衣物类别':attached.origin==='wardrobe'?'来自我的衣服':attached.kindSource==='image'?'已识别，可修改':attached.kindSource==='slot'?'按更换位置使用':'类别可修改';
    copy.append(el('span','conv-attachment-name',attached.name),el('small','conv-attachment-status',status));copy.lastElementChild?.setAttribute('role','status');
    const kind=el('select');kind.setAttribute('aria-label','衣物类别');kind.title='选择这张衣服图的类别，识别有误时可手动修改';kind.add(new Option('选类别',''));
    for(const [k,v] of Object.entries(labels))kind.add(new Option(v,k));kind.value=attached.kind||'';kind.disabled=!!chatGarmentUpload?.target;
    kind.onchange=()=>{attached.kind=kind.value||null;attached.kindSource=attached.kind?'manual':'unknown';drawSpace();saveChatSoon();};
    const remove=button('×','conv-remove',()=>{attachmentRead++;URL.revokeObjectURL(attached.url);chatGarmentUpload=null;if(pendingPiece===attached)pendingPiece=null;drawSpace();saveChatSoon();});remove.type='button';remove.setAttribute('aria-label','移除附件');
    chosen.append(preview,copy,kind,remove);composer.append(chosen);
  }
  const bar=el('div','conv-tools'),add=button('传衣服图','conv-attach',()=>attach.click()),photo=button(portraitBusy?'本人照审核中…':currentPortrait?'更换本人照':'添加本人照','conv-profile',()=>askPersonalPhoto());
  if(currentPortrait&&portraitUrl)photo.prepend(pic(portraitUrl,'当前本人照'));
  photo.disabled=portraitBusy;add.type=photo.type='button';
  add.title='上传本人或已获授权的服装图。支持 JPG、PNG、WebP，单张不超过 10MB。';
  photo.title='请使用本人或已获授权的普通人像。正常童装照片需监护人授权。';
  add.insertAdjacentHTML('afterbegin','<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8a5 5 0 0 1 7 0M7 15l7-7"/></svg>');
  bar.append(add,photo,enter);composer.append(attach,input,bar,dragMessage);
  if(chatPreferences.length){
    const memory=el('details','conv-memory'),summary=el('summary','','已记住 '+chatPreferences.length+' 项偏好'),list=el('div','conv-memory-list');
    memory.open=chatMemoryOpen;list.append(...chatPreferences.map(item=>el('span','',item.value)));memory.append(summary,list);
    summary.setAttribute('aria-label','已记住 '+chatPreferences.length+' 项偏好');
    memory.ontoggle=()=>{if(memory.isConnected)chatMemoryOpen=memory.open;};
    memory.onkeydown=event=>{if(event.key==='Escape'&&memory.open){event.preventDefault();memory.open=false;summary.focus();}};
    wrap.addEventListener('pointerdown',event=>{if(memory.open&&!memory.contains(event.target))memory.open=false;});
    wrap.append(thread,memory,composer);
  }else wrap.append(thread,composer);
  updateInput();
  const settleScroll=()=>requestAnimationFrame(()=>{
    if(!wrap.isConnected)return;
    if(follow)chatScrollToLatest=false;
    updateInput();
    if(settleChatOriginalReveal(thread,originalReveal))return;
    if(garmentEditor){
      const tray=wrap.querySelector('.conv-replace').getBoundingClientRect(),view=thread.getBoundingClientRect();
      if(tray.bottom>view.bottom)thread.scrollTop+=tray.bottom-view.bottom+12;
      else if(tray.top<view.top)thread.scrollTop-=view.top-tray.top+12;
    }else if(conversation.length){
      if(!follow)thread.scrollTop=scrollState.top;
      else{
        thread.scrollTop=thread.scrollHeight;
        const image=thread.querySelector(':scope > .conv-answer:last-child .conv-look');
        if(image&&image.getBoundingClientRect().top<thread.getBoundingClientRect().top){
          thread.scrollTop+=image.getBoundingClientRect().top-thread.getBoundingClientRect().top;
        }
      }
    }
  });
  settleScroll();
  // Images can change the message height after its first layout.
  if(conversation.length)Promise.allSettled(Array.from(thread.querySelectorAll('img'),image=>image.decode())).then(settleScroll);
}
if(window.visualViewport){
  const fitChatViewport=()=>document.documentElement.style.setProperty('--chat-vh',window.visualViewport.height+'px');
  fitChatViewport();window.visualViewport.addEventListener('resize',fitChatViewport);
}
