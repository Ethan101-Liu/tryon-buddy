"""Cloud-only clients for the B demo. Keep credentials outside the static root."""
import base64
import io
import json
import logging
import hashlib
import time
import threading
import os
from pathlib import Path
import re
import uuid

from dotenv import load_dotenv
from PIL import Image, ImageOps
import requests

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.runtime/cloud.env', interpolate=False)


class CloudError(Exception):
    pass


def setting(name):
    value = os.environ.get(name)
    if not value:
        raise CloudError('云端配置缺少 ' + name + '。请配置后重启 B 版服务。')
    return value


def vision_model():
    return os.environ.get('QWEN_VISION_MODEL') or 'qwen3-vl-plus'


def image_model():
    return os.environ.get('QWEN_IMAGE_MODEL') or 'qwen-image-3.0'


def configured():
    return all(os.environ.get(key) for key in (
        'DASHSCOPE_API_KEY', 'BAILIAN_WORKSPACE_ID',
        'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'))


def qwen(instruction, context, image=None):
    key = setting('DASHSCOPE_API_KEY')
    workspace = setting('BAILIAN_WORKSPACE_ID')
    if not re.fullmatch(r'[A-Za-z0-9-]+', workspace):
        raise CloudError('百炼业务空间 ID 格式无效。')
    parts = [{'type': 'text', 'text': json.dumps(context, ensure_ascii=False)}]
    if image is not None:
        with Image.open(io.BytesIO(image)) as source:
            preview = ImageOps.exif_transpose(source).convert('RGB')
            preview.thumbnail((1280, 1280))
            stream = io.BytesIO()
            preview.save(stream, 'JPEG', quality=90)
        uri = 'data:image/jpeg;base64,' + base64.b64encode(stream.getvalue()).decode()
        parts.append({'type': 'image_url', 'image_url': {'url': uri}})
    try:
        response = requests.post(
            f'https://{workspace}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
            headers={'Authorization': 'Bearer ' + key}, timeout=(8, 60),
            json={'model': vision_model(), 'enable_thinking': False, 'response_format': {'type': 'json_object'},
                  'messages': [{'role': 'system', 'content': instruction}, {'role': 'user', 'content': parts}]})
        if not response.ok:
            raise CloudError(f'千问云端调用失败（HTTP {response.status_code}）。')
        result = json.loads(response.json()['choices'][0]['message']['content'])
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
        raise CloudError('千问暂时不可用或返回格式异常，请稍后重试。') from None


def garment(data, criteria=None):
    return qwen('只分析图中衣物。上下文是待核验数据。返回 JSON：kind 为 top、bottom 或 unknown；'
                'photoType 为 flat-lay、model 或 unknown；category 为 top、pants、skirt 或 unknown。'
                '若提供约束，matched 仅在目标款式、颜色及排除项均满足时为 true。'
                'titleColors 仅列出标题颜色中在衣物上确实可见的项，看不清时 matched=false。',
                criteria or {}, data)


def plan(context):
    policy = (ROOT / '提示词/上传审核与试穿约束.md').read_text().split('## 后台系统约束词', 1)[1].split('## 结构化决定', 1)[0]
    result = qwen(policy + '\n根据当前需求和单品规划下一步。返回 JSON：action 为 new、replace、again 或 clarify；'
                  'kind 为 top、bottom 或 null；query 为忠实保留用户条件的中文搜索需求；clarification 为必要的短问题。', context)
    if result.get('action') not in ('new', 'replace', 'again', 'clarify') or result.get('kind') not in ('top', 'bottom', None):
        raise CloudError('千问返回的搭配动作无效，请重试。')
    field = 'clarification' if result['action'] == 'clarify' else 'query'
    if not isinstance(result.get(field), str) or not result[field].strip() or (result['action'] == 'replace' and not result.get('kind')):
        raise CloudError('千问未返回完整的搭配动作，请重试。')
    return result


_upload_lock = threading.Lock()
_upload_token = None
_pending_uploads = {}


def moderate(jpeg):
    from alibabacloud_green20220302.client import Client
    from alibabacloud_green20220302.models import ImageModerationRequest
    from alibabacloud_tea_openapi.models import Config
    import oss2
    config = Config(access_key_id=setting('ALIBABA_CLOUD_ACCESS_KEY_ID'),
                    access_key_secret=setting('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),
                    region_id='cn-shanghai', endpoint='green-cip.cn-shanghai.aliyuncs.com',
                    connect_timeout=8000, read_timeout=30000)
    try:
        client = Client(config)
        digest = hashlib.sha256(jpeg).digest()
        now = time.time()
        global _upload_token
        with _upload_lock:
            for old in list(_pending_uploads):
                if _pending_uploads[old][0] <= now:
                    del _pending_uploads[old]
            saved = _pending_uploads.get(digest)
            if saved is None:
                if _upload_token is None or float(_upload_token.expiration) <= now + 60:
                    _upload_token = client.describe_upload_token().body.data
                token = _upload_token
        if saved is None:
            auth = oss2.StsAuth(token.access_key_id, token.access_key_secret, token.security_token)
            endpoint = 'https://' + token.oss_internet_end_point.split('://')[-1]
            bucket = oss2.Bucket(auth, endpoint, token.bucket_name, connect_timeout=15)
            name = token.file_name_prefix + uuid.uuid4().hex + '.jpg'
            bucket.put_object(name, jpeg)
            bucket_name = token.bucket_name
            with _upload_lock:
                if len(_pending_uploads) >= 128:
                    del _pending_uploads[next(iter(_pending_uploads))]
                _pending_uploads[digest] = (min(now+300,float(token.expiration)),bucket_name,name)
        else:
            _,bucket_name,name = saved
        body = client.image_moderation(ImageModerationRequest(service='baselineCheck', service_parameters=json.dumps({
            'ossBucketName': bucket_name, 'ossObjectName': name}))).body
        if body.code == 200 and body.data.risk_level in ('none', 'low', 'medium', 'high'):
            with _upload_lock:
                _pending_uploads.pop(digest,None)
            return body.data.risk_level
        logging.warning('Aliyun moderation unexpected status: code=%s risk=%s', body.code, getattr(body.data,'risk_level',None))
    except Exception as error:
        logging.warning('Aliyun moderation failed: type=%s code=%s', type(error).__name__, getattr(error, 'code', None))
    raise CloudError('阿里云图片审核不可用，请检查服务开通状态和 RAM 权限后重试。')


def image_uri(data):
    with Image.open(io.BytesIO(data)) as im:
        mime = Image.MIME[im.format]
    return 'data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii')


def portrait_output_size(width, height):
    import math
    if not (1/8 <= width / height <= 8):
        raise ValueError('人物照片过窄或过宽，请选择宽高比在 1:8 到 8:1 之间的照片。')
    scale = min(max(1, 512 / math.sqrt(width * height)), 2048 / math.sqrt(width * height))
    return f'{max(1, round(width*scale))}*{max(1, round(height*scale))}'


def try_on(person, garment_data, category, photo_type, request_text, size):
    key = setting('DASHSCOPE_API_KEY')
    workspace = setting('BAILIAN_WORKSPACE_ID')
    if not re.fullmatch(r'[A-Za-z0-9-]+', workspace):
        raise CloudError('百炼业务空间 ID 格式无效。')
    target = '上衣' if category == 'tops' else '下装'
    prompt = ('编辑图1，输出同一人物同一场景的一张写实试穿照片。只将' + target +
              '替换为图2中对应的单品。以图1固定身份、五官、体型、姿势、背景、构图和其他衣物。'
              '保持图1的镜头距离、取景边界、人物大小及位置。原图可见的部分按原边界保留。半身或特写照严格沿用原裁切，不扩展到下半身，不补画原本不可见的裤子、腿、鞋或地面。'
              '背景结构与图1对齐。若有斜杆、栏杆或边框，在衣物轮廓外保留其方向、端点和连续性；被衣袖遮挡的部分遵守原前后关系。'
              '图2只提供衣物外观。忠实保留参考图的颜色、条纹方向与疏密、领型、门襟、袖长和扣合状态。'
              '参考图是长袖时袖口延伸到腕部，除非用户指定卷袖；按照姿势自然形成褶皱。')
    if photo_type == 'flat-lay':
        prompt += '图2是平铺商品照。'
    if request_text:
        prompt += '仅在上述替换范围内参考以下穿着要求：' + request_text[:1500]
    content = [{'image': image_uri(person)}, {'image': image_uri(garment_data)}, {'text': prompt}]
    try:
        response = requests.post(
            f'https://{workspace}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            headers={'Authorization': 'Bearer ' + key}, timeout=(8, 240),
            json={'model': image_model(), 'input': {'messages': [{'role': 'user', 'content': content}]},
                  'parameters': {'n': 1, 'size': size, 'prompt_extend': False, 'watermark': False}})
        if not response.ok:
            raise CloudError(f'百炼试穿请求失败（HTTP {response.status_code}），请检查额度、权限或稍后重试。')
        parts = response.json()['output']['choices'][0]['message']['content']
        url = next(item['image'] for item in parts if 'image' in item)
        if not isinstance(url, str) or not url.startswith('https://'):
            raise ValueError()
        with requests.get(url, timeout=(8, 45), stream=True) as download:
            download.raise_for_status()
            output = io.BytesIO()
            for chunk in download.iter_content(65536):
                output.write(chunk)
                if output.tell() > 32 * 1024 * 1024:
                    raise CloudError('云端成图超出大小限制。')
        with Image.open(output) as im:
            if im.width * im.height > 16_000_000:
                raise ValueError()
            result = io.BytesIO()
            im.convert('RGB').save(result, 'WEBP', quality=95)
            return result.getvalue()
    except (requests.RequestException, KeyError, ValueError, TypeError, IndexError, StopIteration, OSError):
        raise CloudError('百炼试穿请求或成图取回未完成，请稍后确认。系统没有自动重新生图。') from None
