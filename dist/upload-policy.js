async function preparePortrait(file) {
  if (!file || !file.size || file.size > 32 * 1024 * 1024) throw new Error('请选择 32 MB 以内的单张照片。');
  const response = await fetch('/api/portrait', {method:'POST', body:file});
  if (!response.ok) {
    const detail = await response.json().catch(()=>null);
    throw new Error(detail?.error || '暂时连接不上照片审核服务，请重试。');
  }
  return new File([await response.blob()], 'portrait.jpg', {type:'image/jpeg'});
}

async function checkUploadedImage(file, role) {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!file || !file.size) throw new Error('请选择一张可以读取的图片。');
  if (file.type && !allowed.includes(file.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
  if (file.size > 10 * 1024 * 1024) throw new Error('单张图片请控制在 10MB 以内。');
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('图片无法读取，请重新选择。'));
    reader.readAsDataURL(file);
  });
  let response;
  try {
    response = await fetch('/api/check-upload', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({image, role})
    });
  } catch {
    throw new Error('暂时连接不上图片检查服务，请稍后重试。');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.metadata) throw new Error(result?.error || '图片检查暂时未完成，请重试。');
  return result.metadata;
}
