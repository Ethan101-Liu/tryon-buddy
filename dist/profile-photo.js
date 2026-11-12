// Photos stay on this device, partitioned by the active demo account.
const personalPhoto = (() => {
  const account = () => localStorage.getItem('tryon-demo-profile-active') === 'yes' ? localStorage.getItem('tryon-demo-profile') : null;
  let database;
  async function access(mode, operation) {
    const user=account();
    if(!user)return null;
    if(!database)database=new Promise((resolve,reject)=>{
      const req=indexedDB.open('tryon-profile-photos',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('portraits');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const db=await database;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('portraits',mode),req=operation(tx.objectStore('portraits'),user);
      tx.oncomplete=()=>resolve(req.result);tx.onabort=tx.onerror=()=>reject(tx.error);
    });
  }
  return {account,get:()=>access('readonly',(s,u)=>s.get(u)),put:file=>access('readwrite',(s,u)=>s.put(file,u)),remove:()=>access('readwrite',(s,u)=>s.delete(u))};
})();
