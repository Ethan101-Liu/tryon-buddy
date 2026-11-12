// Frontend-only account flow. The shared demo password is never persisted.
(() => {
  const opener=document.querySelector('[data-space="account"], .primary-nav [aria-controls="account"]');
  const key='tryon-demo-profile', demoPassword='tryon123';
  const box=document.createElement('dialog');
  box.className='account-pop';
  box.setAttribute('aria-label','账号');
  document.body.append(box);
  function signed(){return localStorage.getItem(key+'-active')==='yes'&&localStorage.getItem(key);}
  function sync(){opener.textContent=signed()?'我的账号':'登录/注册';}
  function open(mode='login'){
    const profile=localStorage.getItem(key);
    box.innerHTML='<button type="button" class="account-close" aria-label="关闭">×</button><div class="account-body"></div>';
    const body=box.querySelector('.account-body');
    box.querySelector('.account-close').onclick=()=>box.close();
    if(signed()){
      body.innerHTML='<h2>我的账号</h2><p></p><button class="account-submit">退出登录</button>';
      body.querySelector('p').textContent=signed();
      body.querySelector('.account-submit').onclick=()=>{localStorage.removeItem(key+'-active');sync();open();};
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
        localStorage.setItem(key,value);localStorage.setItem(key+'-active','yes');sync();box.close();
      };
    }
    if(!box.open)box.showModal();
    opener.setAttribute('aria-expanded','true');
    (body.querySelector('input')||body.querySelector('button'))?.focus({preventScroll:true});
  }
  opener.removeAttribute('data-space');opener.setAttribute('aria-haspopup','dialog');opener.setAttribute('aria-expanded','false');
  opener.addEventListener('click',e=>{e.stopImmediatePropagation();open();},true);
  box.addEventListener('click',e=>{const r=box.getBoundingClientRect();if(e.target===box&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))box.close();});
  box.onclose=()=>{opener.setAttribute('aria-expanded','false');opener.focus({preventScroll:true});};
  sync();
  if(location.hash==='#account'){history.replaceState(null,'',location.pathname+location.search);open();}
})();
