// Frontend-only account flow. The shared demo password is never persisted.
(() => {
  const opener=document.querySelector('[data-space="account"], .primary-nav [aria-controls="account"]');
  const key='tryon-demo-profile', demoPassword='tryon123';
  const box=document.createElement('dialog');
  box.className='account-pop';
  box.setAttribute('aria-label','账号');
  document.body.append(box);
  function signed(){return localStorage.getItem(key+'-active')==='yes'&&localStorage.getItem(key);}
  let photoURL;
  function clearPreview(){if(photoURL)URL.revokeObjectURL(photoURL);photoURL=null;}
  function changed(){window.dispatchEvent(new Event('tryon-profile-change'));}
  const openerLabel=opener.querySelector('.account-label')||opener;
  function sync(){openerLabel.textContent=signed()?'我的账号':'登录/注册';}
  function open(mode='login'){
    const profile=localStorage.getItem(key);
    box.innerHTML='<button type="button" class="account-close" aria-label="关闭">×</button><div class="account-body"></div>';
    const body=box.querySelector('.account-body');
    box.querySelector('.account-close').onclick=()=>box.close();
    if(signed()){
      body.innerHTML='<h2>个人资料</h2><p></p><div class="profile-photo"><img alt="本人试穿照" hidden><label>本人试穿照<input type="file" accept="image/*,.heic,.heif"></label><button class="remove-picture" hidden>删除照片</button><small role="status">照片仅保存在本机，用于试穿。</small></div><button class="account-submit">退出登录</button>';
      const user=signed(),image=body.querySelector('img'),remove=body.querySelector('.remove-picture'),input=body.querySelector('input'),status=body.querySelector('small');
      status.textContent='照片保存在当前浏览器，生图时发送到试穿服务处理。';
      body.querySelector('p').textContent=user;
      let serial=0;
      async function preview(){
        const n=++serial;
        try{
          const file=await personalPhoto.get();
          if(n!==serial||signed()!==user||!image.isConnected)return;
          clearPreview();image.hidden=remove.hidden=!file;
          if(file){photoURL=URL.createObjectURL(file);image.src=photoURL;}else image.removeAttribute('src');
        }catch{status.textContent='未能读取本机照片。';}
      }
      input.onchange=async()=>{
        const file=input.files[0];if(!file)return;
        status.textContent='正在准备并审核本人照…';
        try{const normalized=await preparePortrait(file);if(signed()!==user||!input.isConnected)return;
          await personalPhoto.put(normalized);await preview();changed();status.textContent='本人照已保存，可在试穿对话中使用。';
        }catch(error){status.textContent=error.message||'保存失败，请换一张 JPG、PNG 或 WebP 图片。';}
        finally{input.value='';}
      };
      remove.onclick=async()=>{try{await personalPhoto.remove();await preview();changed();status.textContent='已删除本人照。';}catch{status.textContent='删除失败，请重试。';}};
      body.querySelector('.account-submit').onclick=()=>{localStorage.removeItem(key+'-active');clearPreview();changed();sync();open();};
      preview();
    }else{
      const reset=mode==='reset', register=mode==='register';
      body.innerHTML='<div class="account-tabs"><button type="button">登录账号</button><button type="button">注册</button></div><form><label>账号<input name="account" required maxlength="40" placeholder="输入演示账号" autocomplete="off"></label><label class="password-label">密码<input name="password" type="password" autocomplete="off" placeholder="输入演示密码"></label><button type="button" class="account-forgot">忘记密码？</button><small role="status"></small><button class="account-submit"></button></form>';
      const [loginTab,registerTab]=body.querySelectorAll('.account-tabs button');
      loginTab.onclick=()=>open('login');registerTab.onclick=()=>open('register');
      for(const [tab,selected] of [[loginTab,!register&&!reset],[registerTab,register]])tab.setAttribute('aria-pressed',String(selected));
      const form=body.querySelector('form'), name=form.elements.account, password=form.elements.password, status=form.querySelector('small');
      name.value=register?'':profile||'试穿体验';
      status.textContent='前端体验 · 请使用演示密码 '+demoPassword;
      form.querySelector('.account-forgot').onclick=()=>open('reset');
      if(reset){
        body.querySelector('.account-tabs').hidden=true;
        body.querySelector('.account-tabs').after(Object.assign(document.createElement('h2'),{textContent:'找回演示密码'}));
        form.querySelector('.password-label').hidden=true;
        const back=form.querySelector('.account-forgot');back.textContent='返回登录';back.onclick=()=>open();
        status.textContent='输入本机演示账号，查看体验密码。';
      }
      password.required=!reset;
      form.querySelector('.account-submit').textContent=reset?'查看演示密码':register?'注册并登录':'登录';
      form.onsubmit=event=>{
        event.preventDefault();const value=name.value.trim();
        if(!value){status.textContent='请输入账号。';name.focus();return;}
        const profiles=new Set(['试穿体验',...(JSON.parse(localStorage.getItem(key+'-list')||'[]'))]);
        if(profile)profiles.add(profile);
        if(register && profiles.has(value)){status.textContent='这个账号已注册，请切换到登录。';return;}
        if(!register && !profiles.has(value)){status.textContent='未找到这个演示账号。';return;}
        if(reset){status.textContent='此账号的演示密码为 '+demoPassword;return;}
        if(password.value!==demoPassword){status.textContent='请使用演示密码 '+demoPassword;password.select();return;}
        profiles.add(value);localStorage.setItem(key+'-list',JSON.stringify([...profiles]));
        localStorage.setItem(key,value);localStorage.setItem(key+'-active','yes');sync();box.close();changed();
      };
    }
    if(!box.open)box.showModal();
    opener.setAttribute('aria-expanded','true');
    (body.querySelector('input')||body.querySelector('button'))?.focus({preventScroll:true});
  }
  opener.removeAttribute('data-space');opener.setAttribute('aria-haspopup','dialog');opener.setAttribute('aria-expanded','false');
  opener.addEventListener('click',e=>{e.stopImmediatePropagation();open();},true);
  box.addEventListener('click',e=>{const r=box.getBoundingClientRect();if(e.target===box&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))box.close();});
  box.onclose=()=>{clearPreview();opener.setAttribute('aria-expanded','false');opener.focus({preventScroll:true});};
  window.addEventListener('storage',event=>{
    if(event.key!==null&&event.key!==key&&event.key!==key+'-active')return;
    sync();
    if(box.open)open();
  });
  sync();
  if(location.hash==='#account'){history.replaceState(null,'',location.pathname+location.search);open();}
})();
