"""Serve 试穿搭子, live garment search, and the configured model provider."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import ipaddress
import json
import logging
import os
from pathlib import Path
import queue
import re
import secrets
import socket
import threading
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parent
from ddgs import DDGS
from model_provider import cloud
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
register_heif_opener()
from image_policy import PolicyError, UploadPolicy


_upload_policy = None
_upload_policy_lock = threading.Lock()



def get_upload_policy():
    global _upload_policy
    with _upload_policy_lock:
        if _upload_policy is None:
            _upload_policy = UploadPolicy(ROOT / '提示词/上传审核与试穿约束.md')
        return _upload_policy


def upload_bytes(encoded):
    policy = get_upload_policy()
    if not isinstance(encoded, str) or not encoded:
        raise PolicyError('invalid_image', '图片无法读取，请重新选择。')
    maximum = policy.file_rules['max_bytes']
    if len(encoded) > 4 * ((maximum + 2) // 3):
        raise PolicyError('image_too_large', '单张图片请控制在 10MB 以内。')
    try:
        return base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as error:
        raise PolicyError('invalid_image', '图片无法读取，请重新选择。') from error


def public_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username:
        raise ValueError('图片地址无效')
    if re.fullmatch(r'[\d.:]+', parsed.hostname):
        raise ValueError('图片地址无效')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    # This machine's network proxy maps public hostnames into a fake-DNS subnet.
    proxy_dns = ipaddress.ip_network('198.18.0.0/15')
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global and
                            ipaddress.ip_address(row[4][0]) not in proxy_dns for row in addresses):
        raise ValueError('图片地址无效')
    return url


class PublicRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        public_url(new_url)
        return super().redirect_request(request, fp, code, message, headers, new_url)


def garment_image(url, timeout=15):
    request = Request(public_url(url), headers={'User-Agent': 'Mozilla/5.0'})
    with build_opener(PublicRedirect()).open(request, timeout=timeout) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('商品图片过大')
    with Image.open(io.BytesIO(data)) as source:
        if source.width * source.height > 30_000_000:
            raise ValueError('商品图片过大')
        if source.format not in ('JPEG','PNG','WEBP') or getattr(source,'is_animated',False):
            raise ValueError('请选择静态商品图')
        source.load()
        image = ImageOps.exif_transpose(source).convert('RGB')
        image.thumbnail((1200, 1200))
        output = io.BytesIO()
        image.save(output, 'JPEG', quality=92)
    return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()


COLOR_PATTERNS = {
    '浅色': r'浅|米白|米色|奶白|奶油白|乳白|象牙|白色|卡其|杏色|light|cream|ivory|beige',
    '浅灰色': r'浅灰|银灰|light[ -]?gr[ae]y',
    '深灰色': r'深灰|炭灰|碳灰|dark[ -]?gr[ae]y|\bcharcoal\b',
    '浅蓝色': r'浅蓝|水洗蓝|light[ -]?blue|pale[ -]?blue',
    '米白': r'米白|奶白|奶油白|乳白|象牙白|cream|ivory|off[ -]?white',
    '米色': r'米色|米白|杏色|beige|cream',
    '白色': r'白|white|ivory|cream',
    '黑色': r'黑|black',
    '蓝色': r'蓝|blue|denim',
    '深蓝色': r'深蓝|藏青|navy|dark[ -]?blue',
    '灰色': r'灰|gr[ae]y',
    '棕色': r'棕|褐|咖啡|brown',
    '绿色': r'绿|green',
    '墨绿色': r'墨绿|深绿|dark[ -]?green|forest[ -]?green',
    '红色': r'红|\bred\b',
    '黄色': r'黄|\byellow\b',
    '粉色': r'粉|\bpink\b',
    '紫色': r'紫|\bpurple\b|\bviolet\b',
    '橙色': r'橙|橘|\borange\b',
    '卡其色': r'卡其|\bkhaki\b',
    '深色': r'深|黑|藏青|墨绿|dark|black|navy',
}
COLOR_INPUTS = [
    ('浅灰色', r'浅灰(?:色)?|银灰(?:色)?'),
    ('深灰色', r'(?:深灰|炭灰|碳灰)(?:色)?'),
    ('浅蓝色', r'浅蓝(?:色)?|水洗蓝'),
    ('深蓝色', r'深蓝(?:色)?|藏青(?:色)?'),
    ('墨绿色', r'墨绿(?:色)?|深绿(?:色)?'),
    ('浅色', r'浅色'),
    ('米白', r'米白(?:色)?|奶油白|奶白(?:色)?|乳白(?:色)?|象牙白'),
    ('米色', r'米色|杏色'),
    ('白色', r'白色|白(?=T恤|衬衫|上衣|裤|裙)'),
    ('黑色', r'黑色|黑(?=T恤|衬衫|上衣|裤|裙)'),
    ('蓝色', r'蓝色|蓝(?=T恤|衬衫|上衣|裤|裙)'),
    ('灰色', r'灰色|灰(?=T恤|衬衫|上衣|裤|裙)'),
    ('棕色', r'棕色|褐色|咖啡色'),
    ('绿色', r'绿色|绿(?=T恤|衬衫|上衣|裤|裙)'),
    ('红色', r'红色|红(?=T恤|衬衫|上衣|外套|夹克|毛衣|针织|卫衣|裤|裙)'),
    ('黄色', r'黄色|黄(?=T恤|衬衫|上衣|外套|夹克|毛衣|针织|卫衣|裤|裙)'),
    ('粉色', r'粉色|粉红(?:色)?|粉(?=T恤|衬衫|上衣|外套|夹克|毛衣|针织|卫衣|裤|裙)'),
    ('紫色', r'紫色|紫(?=T恤|衬衫|上衣|外套|夹克|毛衣|针织|卫衣|裤|裙)'),
    ('橙色', r'橙(?:色)?|橘(?:色)?'),
    ('卡其色', r'卡其(?:色)?'),
    ('深色', r'深色'),
]
GARMENT_INPUTS = {
    'top': [
        ('衬衫', r'衬衫|衬衣'), ('T恤', r'T恤|T-shirt|tee'),
        ('针织衫', r'针织衫|针织上衣|针织'), ('毛衣', r'毛衣'),
        ('卫衣', r'卫衣'), ('夹克', r'夹克'), ('西装外套', r'西[装服](?:外套|上衣)|小西装(?!裤)'), ('外套', r'外套'),
        ('背心', r'背心'), ('吊带上衣', r'吊带'), ('泳装', r'泳装|泳衣'),
        ('比基尼', r'比基尼'), ('内衣', r'内衣|文胸|胸罩'), ('上衣', r'上衣|上装'),
    ],
    'bottom': [
        ('牛仔裤', r'牛仔裤'), ('休闲裤', r'休闲裤'), ('西裤', r'西裤|西装长裤|西装裤'),
        ('短裤', r'短裤'), ('直筒长裤', r'直筒长裤|直筒裤|长裤'),
        ('半身裙', r'半身裙|半裙'), ('短裙', r'短裙'), ('长裙', r'长裙'),
        ('裙子', r'裙子|裙'), ('直筒长裤', r'裤子|裤|下装'),
    ],
}
GARMENT_PATTERNS = {
    '衬衫': r'衬衫|衬衣|(?<!t-)(?<!t )\bshirts?\b|\bblouses?\b|button[ -](?:down|up)', 'T恤': r'T恤|T-shirt|tee',
    '针织衫': r'针织|knit|sweater|pullover', '毛衣': r'毛衣|针织|sweater|pullover',
    '卫衣': r'卫衣|hoodie|sweatshirt', '夹克': r'夹克|jacket',
    '西装外套': r'西[装服](?!长裤|裤|裙)|blazer|suit[ -]+jacket',
    '外套': r'外套|夹克|风衣|大衣|coat|jacket', '背心': r'背心|tank|vest',
    '吊带上衣': r'吊带|camisole', '泳装': r'泳装|泳衣|swimsuit|swimwear',
    '比基尼': r'比基尼|bikini', '内衣': r'内衣|文胸|胸罩|bra|lingerie',
    '上衣': r'上衣|上装|衬衫|衬衣|T恤|针织|毛衣|卫衣|夹克|外套|背心|吊带|shirt|top|knit|sweater|jacket',
    '牛仔裤': r'牛仔裤|牛仔长裤|jeans|denim', '休闲裤': r'休闲裤|休闲长裤|chinos|casual.*pants',
    '西裤': r'西裤|西装裤|西装长裤|\bslacks\b|\b(?:dress|tailored|suit)\b.{0,30}\b(?:pants|trousers)\b',
    '短裤': r'短裤|shorts', '直筒长裤': r'裤|trousers|pants|jeans',
    '半身裙': r'半身裙|半裙|skirt', '短裙': r'短裙|mini.*skirt',
    '长裙': r'长裙|maxi.*skirt|long.*skirt', '裙子': r'裙|skirt',
}
FEATURE_PATTERNS = {
    '透视': r'透视|透明|see[ -]?through|sheer',
    '露肩': r'露肩|一字肩|off[ -]?shoulder',
    '露脐': r'露脐|露肚|crop(?:ped)?[ -]?top',
    '破洞': r'破洞|大洞|ripped|distressed',
    '情趣': r'情趣|erotic',
    '紧身': r'紧身|修身|bodycon|skinny',
    '无袖': r'无袖|sleeveless',
}
REQUIRED_FEATURE_GROUPS = {
    'cut': {'直筒': r'直筒|straight[ -]?(?:leg|fit)', '阔腿': r'阔腿|wide[ -]?leg',
            '紧身': r'紧身|skinny|slim[ -]?fit', '喇叭': r'喇叭|flared?|bootcut',
            '锥形': r'锥形|tapered', '宽松': r'宽松|loose|relaxed|oversized'},
    'sleeve': {'长袖': r'长袖|long[ -]?sleeve', '短袖': r'短袖|short[ -]?sleeve', '无袖': r'无袖|sleeveless'},
}
for _feature_patterns in REQUIRED_FEATURE_GROUPS.values():
    for _feature_name, _feature_pattern in _feature_patterns.items():
        FEATURE_PATTERNS.setdefault(_feature_name, _feature_pattern)
NEGATIVE_FRAGMENT = re.compile(r'(?:不要|不想(?:要|穿|选)|不喜欢|不穿|不考虑|别选|避免|排除|不能|不(?=透视|露肩|露脐|破洞|紧身|无袖|阔腿|直筒|喇叭|锥形|宽松|长袖|短袖))[^，,。！？!?；;\n]*')
STYLE_WORDS = ['简约', '休闲', '通勤', '宽松', '复古', '运动', '法式']
WORK_OCCASION = r'面试|(?:拜访|见|接待|会见|约见)(?:一下|重要的?)?客户|开会|上班|通勤|商务'
WALKING = r'步行|徒步|走(?:很|挺|比较|特别|非常)?多(?:的)?路|走不少路|走路多|走(?:一整天|一天|很久)|久走'
CASUAL_OUTING = r'周末|看展|出游|旅游|逛街|郊游|野餐|公园|露营'
EVENT_OCCASION = r'毕业典礼|颁奖典礼|音乐会|演唱会|演出|婚宴|婚礼|聚会'
OCCASION_PATTERN = '|'.join((WORK_OCCASION, WALKING, CASUAL_OUTING, EVENT_OCCASION,
                             r'日常|约会|运动|游泳|海边|居家|上课|上学|出差'))


def named_matches(text, patterns):
    matches = []
    for priority, (name, pattern) in enumerate(patterns):
        for match in re.finditer(pattern, text, re.I):
            matches.append((match.start(), priority, match.end(), name))
    result, end = [], -1
    for position, priority, stop, name in sorted(matches):
        if position < end:
            continue
        result.append(name)
        end = stop
    return result


def colors_in(text):
    return named_matches(text, COLOR_INPUTS)


def unsupported_colors(text):
    """Keep an unsupported named shade from becoming an unrestricted/base-color search."""
    # Split conversational/garment prefixes before checking the whole remaining shade.
    prefix = r'想要|想换|换成|改成|换一条|换一件|一条|一件|一套|不要|不想|不喜欢|不穿|别选|避免|排除|上衣|裤子|衣服|外套|下装|搭配|颜色|这个|那个|这种|最好|希望|喜欢|请|给我|帮我|保留|看看|试试|试穿|适合|有没有|先|再|比较|更|用|穿|要|成|的|选|找|换|是|为|和|或|不|条|件|个|款|试|看|呈'
    ignored = {'配色', '撞色', '纯色', '同色', '异色', '底色', '肤色', '发色', '脸色', '景色', '特色', '出色', '角色', '变色', '本色'}
    names = re.findall(r'[\u4e00-\u9fff]{1,16}色', text)
    # Popular shade names are also explicit when the suffix 色 is omitted.
    names += re.findall(r'(?:雾霾蓝|雾蓝|豆沙粉|豆沙红|玫瑰红|玫红|酒红|砖红|铁锈红|宝蓝|天蓝|湖蓝|孔雀蓝|军绿|橄榄绿|薄荷绿|抹茶绿|牛油果绿|香槟|驼色|焦糖|藕粉|珊瑚粉|樱花粉|薰衣草紫|荧光[红黄粉紫橙蓝绿])(?:色)?', text)
    unsupported = []
    for name in names:
        if any(name.endswith(word) for word in ignored):
            continue
        name = re.split(prefix, name)[-1]
        if not name or name in ignored or name == '色':
            continue
        if not any(re.fullmatch(pattern, name, re.I) for _, pattern in COLOR_INPUTS):
            unsupported.append(name)
    return list(dict.fromkeys(unsupported))


def source_colors(title):
    """Read color evidence from the original listing, never from the user's query."""
    colors = [name for name, pattern in COLOR_PATTERNS.items() if re.search(pattern, title, re.I)]
    narrower = {'浅灰色': ('灰色',), '深灰色': ('灰色',), '浅蓝色': ('蓝色',), '米白': ('白色', '米色'),
                '深蓝色': ('蓝色',), '墨绿色': ('绿色',), '粉色': ('红色',)}
    for specific, broader in narrower.items():
        if specific in colors:
            colors = [name for name in colors if name not in broader]
    return colors


def source_display_name(title, kind, verification):
    """Use only title words and image-confirmed colors for the short UI label."""
    colors = verification['titleColors']
    color = next((name for name in colors if name not in ('浅色', '深色')), '')
    color = color or next(iter(colors), '')
    # Unlike intent parsing, a source label should not let a trailing generic
    # “上衣/长裤” erase the more specific product noun found earlier in the title.
    preferred = (('衬衫', 'T恤', '卫衣', '夹克', '外套', '针织衫', '毛衣', '背心', '吊带上衣', '泳装', '比基尼', '内衣', '上衣')
                 if kind == 'top' else ('牛仔裤', '西裤', '短裤', '休闲裤', '短裙', '长裙', '半身裙', '裙子', '直筒长裤'))
    if kind == 'bottom' and (verification.get('category') == 'skirt' or
            (re.search(r'裙|skirt', title, re.I) and not re.search(r'裤|trousers|pants|jeans', title, re.I))):
        preferred = ('短裙', '长裙', '半身裙', '裙子')
    garment = next((name for name in preferred if re.search(GARMENT_PATTERNS[name], title, re.I)), '')
    if garment == '牛仔裤' and re.search(GARMENT_PATTERNS['短裤'], title, re.I):
        garment = '牛仔短裤'
    if kind == 'bottom' and garment == '直筒长裤' and not re.search(r'直筒|straight', title, re.I):
        garment = '长裤'
    return color + (garment or ('上衣' if kind == 'top' else '下装'))


def garment_in(text, kind):
    matches = named_matches(text, GARMENT_INPUTS[kind])
    return matches[-1] if matches else ''


CHILD_TITLE_PATTERN = re.compile(
    r'童装|儿童|婴儿|婴童|婴幼|幼儿|宝宝|男童|女童|小童|中童|大童|童款|童裤|童衣|小孩|小朋友|'
    r'\b(?:bab(?:y|ies)|infants?|newborns?|toddlers?|kids?|children|child|boys?|girls?|youth|juniors?)\b', re.I)
MEN_TITLE_PATTERN = re.compile(
    r'男(?:装|款|士|式|性|人|生)|男(?=上装|下装|裤|衬衫|上衣|外套|夹克|卫衣|T恤)|(?<=裤)男|(?<=衫)男|(?<=衣)男|(?<=恤)男|'
    r'\b(?:men(?:[\'’]s|s)?|menswear|man|male|gentlemen|gents?)\b', re.I)
WOMEN_TITLE_PATTERN = re.compile(
    r'女(?:装|款|士|式|性|人|生)|女(?=上装|下装|裤|衬衫|上衣|外套|夹克|卫衣|T恤)|(?<=裤)女|(?<=衫)女|(?<=衣)女|(?<=恤)女|'
    r'\b(?:women(?:[\'’]s|s)?|womenswear|woman|female|ladies|lady)\b', re.I)
NEUTRAL_TITLE_PATTERN = re.compile(r'男女同款|男女通用|男女皆宜|男女可穿|男女(?=复古|休闲|通勤|基础款|纯色|衬衫|针织)|中性|情侣|\bunisex\b|\bgender[ -]?neutral\b', re.I)
NON_HUMAN_TITLE_PATTERN = re.compile(
    r'娃衣|娃服|(?:娃娃|芭比)(?:衣服|服装|上衣|裤子|裙子)|(?:玩偶|公仔|棉花娃娃)(?:服|衣|裤|裙)|'
    r'宠物|犬服|猫服|狗衣|猫衣|(?:狗狗|猫咪|小狗|小猫)(?:衣服|服装|外套|上衣|卫衣)|'
    r'\b(?:bjd|ob11)\b|\bfor[ -]+(?:(?:small|large|medium|tiny)[ -]+)?(?:dolls?|dogs?|cats?|pets?|puppies|kittens?)\b|'
    r'\bdolls?[ -]+(?:clothes|clothing|outfits?|shirts?|pants|dress(?:es)?)\b|'
    r'\b(?:pets?|dogs?|cats?|pupp(?:y|ies)|kittens?)[ -]+(?:(?:winter|summer|warm|rain|waterproof|knit|cotton|christmas|halloween)[ -]+){0,3}(?:clothes|clothing|outfits?|coats?|jackets?|shirts?|dress(?:es)?|pants|sweaters?|hoodies|apparel)\b', re.I)


def source_audience_evidence(title, audience='adult'):
    """Check explicit listing claims, without inferring age or gender from a face."""
    # These phrases describe adult styles/colors/prints, not the intended wearer.
    cleaned = re.sub(r'\bbaby[ -]+(?:blue|pink|tee|t[ -]?shirt|doll)\b|\b(?:dog|cat)[ -]+(?:mom|dad|print|pattern|motif)\b|(?:猫咪|狗狗|小猫|小狗)(?:印花|图案)', '', title, flags=re.I)
    if NON_HUMAN_TITLE_PATTERN.search(cleaned):
        return None
    child = bool(CHILD_TITLE_PATTERN.search(cleaned))
    men, women = bool(MEN_TITLE_PATTERN.search(cleaned)), bool(WOMEN_TITLE_PATTERN.search(cleaned))
    adult = bool(re.search(r'成人|成年人|\badults?\b', cleaned, re.I)) or men or women
    family = bool(re.search(r'亲子|母女|父子|妈妈.{0,6}女儿|爸爸.{0,6}儿子|\bfamily[ -]+matching\b|\bmommy[ -]+and[ -]+me\b|\bmother[ -]+daughter\b|\bfather[ -]+son\b', cleaned, re.I))
    # A gallery/SEO title covering adults and children does not identify this image's variant.
    if family or (child and adult):
        return None
    if audience == 'children':
        if not child:
            return None
    elif child:
        return None
    neutral = bool(NEUTRAL_TITLE_PATTERN.search(cleaned)) or (men and women)
    if audience == 'neutral' and (men or women) and not neutral:
        return None
    if not neutral and ((audience == 'men' and women and not men) or (audience == 'women' and men and not women)):
        return None
    return {'requested': audience, 'ageGroup': 'children' if child else 'adult' if adult else 'unspecified',
            'gender': 'neutral' if neutral else 'men' if men else 'women' if women else 'unspecified',
            'scope': 'source-title-only'}


def request_audience(text):
    positive = NEGATIVE_FRAGMENT.sub('', text.split(' -', 1)[0])
    labels = named_matches(positive, [
        ('children', r'童装|儿童|孩子|婴儿|婴童|幼儿|宝宝|男童|女童'),
        ('men', r'男装|男生|男士|男款'), ('women', r'女装|女生|女士|女款'),
        ('adult', r'成人|成年人|中性|男女同款|男女通用'),
    ])
    return labels[-1] if labels else 'adult'


def constraint_pattern(name):
    styles = {'简约': r'简约|minimalist', '休闲': r'休闲|casual', '通勤': r'通勤|office',
              '宽松': r'宽松|loose|oversized', '复古': r'复古|retro|vintage',
              '运动': r'运动|sporty|athletic', '法式': r'法式|french'}
    return FEATURE_PATTERNS.get(name) or COLOR_PATTERNS.get(name) or GARMENT_PATTERNS.get(name) or styles.get(name, r'(?!)')


def identifies_slot(garment, text, previous):
    # A generic noun identifies the slot in “裤子换成深灰色”; switching a skirt to
    # pants is a real category change, as is naming a specific cut or style.
    return garment == '上衣' or (garment == '直筒长裤' and not re.search('直筒|长裤', text)
            and not ('裙' in previous and '裤' in text))


def request_constraints(text, kind, refill_garment=None):
    result = {'color': '', 'garment': refill_garment or '', 'excluded': [], 'positive': '', 'features': {}, 'unsupportedColors': []}
    for clause in re.split(r'[，,。！？!?；;\n]+', text):
        has_top = bool(garment_in(clause, 'top'))
        has_bottom = bool(garment_in(clause, 'bottom'))
        parts = re.split(r'搭配|配|以及|和|加上', clause) if has_top and has_bottom else [clause]
        for part in parts:
            other_kind = 'bottom' if kind == 'top' else 'top'
            own_garment = garment_in(part, kind)
            if garment_in(part, other_kind) and not own_garment:
                continue
            result['unsupportedColors'].extend(unsupported_colors(part))
            # Exclusions are removed before positive colors and garments are read.
            negatives = NEGATIVE_FRAGMENT.findall(part)
            for negative in negatives:
                colors = colors_in(negative)
                features = [name for name, pattern in FEATURE_PATTERNS.items() if re.search(pattern, negative, re.I)]
                features.extend(word for word in STYLE_WORDS if word in negative)
                result['excluded'].extend(colors + features)
                negative_garment = garment_in(negative, kind)
                if negative_garment:
                    if colors or features:
                        result['garment'] = negative_garment
                    else:
                        result['excluded'].append(negative_garment)
            positive = NEGATIVE_FRAGMENT.sub('', part)
            result['positive'] += ' ' + positive
            colors = colors_in(positive)
            if colors:
                result['color'] = colors[-1]
            garment = garment_in(positive, kind)
            if garment and not (refill_garment is not None and result['garment']
                                and identifies_slot(garment, positive, result['garment'])):
                result['garment'] = garment
            for group, patterns in REQUIRED_FEATURE_GROUPS.items():
                # A sleeve belongs only to a top, including when no garment noun is repeated.
                if group == 'sleeve' and kind != 'top':
                    continue
                matches = named_matches(positive, list(patterns.items()))
                if matches:
                    result['features'][group] = matches[-1]
            result['excluded'] = [name for name in result['excluded']
                                  if not re.search(constraint_pattern(name), positive, re.I)]
    result['excluded'] = list(dict.fromkeys(result['excluded']))
    return result


def matches_garment(title, kind, color, garment, excluded=(), required_features=()):
    if re.search(r'背面|后背(?:展示|实拍|图)|back[ -]?(?:view|side)|合集|大盘点|lookbook|round[ -]?up', title, re.I):
        return False
    pattern = GARMENT_PATTERNS.get(garment, GARMENT_PATTERNS['上衣'] if kind == 'top' else r'裤|裙|trousers|pants|jeans|skirt')
    if not re.search(pattern, title, re.I):
        return False
    if kind == 'bottom' and '裙' not in garment and re.search(r'裙|skirt', title, re.I):
        return False
    if color and not re.search(COLOR_PATTERNS[color], title, re.I):
        return False
    if color in ('浅色', '浅灰色', '浅蓝色') and re.search(r'深|黑色|藏青|black|navy|dark', title, re.I):
        return False
    for name in excluded:
        if re.search(constraint_pattern(name), title, re.I):
            return False
    for name in required_features:
        pattern = next((patterns[name] for patterns in REQUIRED_FEATURE_GROUPS.values() if name in patterns), None)
        if pattern and not re.search(pattern, title, re.I):
            return False
    return True


def english_garment_query(query, constraints, kind='top'):
    positive_query = query.split(' -', 1)[0]
    audience = constraints.get('audience') or request_audience(positive_query)
    gender = {'men': 'men', 'women': 'women', 'children': 'kids', 'adult': 'adult', 'neutral': 'unisex'}.get(audience, 'adult')
    colors = {'浅色': 'light', '浅灰色': 'light grey', '深灰色': 'dark grey', '浅蓝色': 'light blue', '米白': 'ivory',
              '米色': 'beige', '白色': 'white', '黑色': 'black', '蓝色': 'blue',
              '灰色': 'grey', '棕色': 'brown', '绿色': 'green', '深色': 'dark',
              '深蓝色': 'navy', '墨绿色': 'dark green', '红色': 'red', '黄色': 'yellow',
              '粉色': 'pink', '紫色': 'purple', '橙色': 'orange', '卡其色': 'khaki'}
    garments = {'衬衫': 'shirt', 'T恤': 'T-shirt', '针织衫': 'knit sweater', '毛衣': 'sweater',
                '卫衣': 'sweatshirt', '夹克': 'jacket', '外套': 'jacket', '西装外套': 'blazer', '背心': 'tank top',
                '吊带上衣': 'camisole', '泳装': 'swimwear', '比基尼': 'bikini', '内衣': 'lingerie', '上衣': 'top',
                '牛仔裤': 'jeans', '休闲裤': 'casual pants', '西裤': 'tailored trousers',
                '短裤': 'shorts', '直筒长裤': 'trousers', '半身裙': 'skirt', '短裙': 'mini skirt', '长裙': 'maxi skirt', '裙子': 'skirt'}
    styles = {'简约': 'minimalist', '休闲': 'casual', '通勤': 'office', '宽松': 'loose',
              '复古': 'retro', '运动': 'sporty', '法式': 'French'}
    excluded = {'透视': 'sheer', '露肩': 'off-shoulder', '露脐': 'cropped', '破洞': 'ripped',
                '情趣': 'erotic', '紧身': 'skinny', '无袖': 'sleeveless', **colors, **styles}
    parts = [gender, colors.get(constraints.get('color', ''), ''), garments.get(constraints.get('garment', ''), 'top')]
    parts.extend(english for name, english in styles.items() if name in positive_query)
    features = {'直筒': 'straight leg', '阔腿': 'wide leg', '紧身': 'skinny', '喇叭': 'flared',
                '锥形': 'tapered', '宽松': 'loose', '长袖': 'long sleeve', '短袖': 'short sleeve', '无袖': 'sleeveless'}
    excluded.update(features)
    excluded['西装外套'] = 'blazer'
    parts.extend(features[name] for name in constraints.get('requiredFeatures', []) if name in features)
    parts.append('front model product' if kind == 'top' else 'front product')
    parts.extend('-"' + excluded.get(name, name) + '"' for name in constraints.get('excluded', []))
    return ' '.join(filter(None, parts))


class CandidateReviewPaused(Exception):
    def __init__(self, candidates, image):
        self.candidates = candidates
        self.image = image


def finish_candidate_review(candidates, image):
    while True:
        try:
            review_with_retry(base64.b64decode(image.split(',',1)[1], validate=True), 'garment', None)
            allowed = True
        except PolicyError as error:
            if error.code == 'moderation_unavailable':
                raise CandidateReviewPaused(candidates, image) from None
            allowed = False
        try:
            image = candidates.send(allowed)
        except StopIteration as done:
            return done.value


def find_garment(query, kind, excluded, constraints=None):
    candidates = garment_candidates(query, kind, excluded, constraints)
    return finish_candidate_review(candidates, next(candidates))


def garment_candidates(query, kind, excluded, constraints=None):
    constraints = constraints or {}
    audience = constraints.get('audience') or request_audience(query)
    garment = constraints.get('garment', '')
    synonyms = {'衬衫': '衬衣', '西裤': '西装裤', '针织衫': '针织上衣', '外套': '夹克', '直筒长裤': '直筒裤', '半身裙': '半裙'}
    queries = [query]
    if garment:
        alternate = synonyms.get(garment, garment)
        queries.append(query.replace(garment, alternate))
        # Image search sometimes matches the photography instructions verbatim.
        # Broaden retrieval, then apply the same title, audience and image checks.
        wearer = {'women': '女士', 'men': '男士', 'children': '童装', 'neutral': '男女同款'}.get(audience, '成人')
        styles = [s for s in STYLE_WORDS if s in query.split(' -', 1)[0]]
        queries.append(' '.join(filter(None, [wearer, *styles, constraints.get('color'),
                    *constraints.get('requiredFeatures', ()), alternate, '模特正面' if kind == 'top' else '商品图'])))
    queries.append(english_garment_query(query, constraints, kind))
    seen_images = set()
    rejected = {}
    reached_search = False
    deadline = time.monotonic() + 75
    for search_query in dict.fromkeys(queries):
        english = search_query == queries[-1]
        query_deadline = deadline if english else min(deadline, time.monotonic() + 12)
        results = []
        for attempt in range(2):
            remaining = query_deadline - time.monotonic()
            if remaining < 1:
                break
            try:
                region = 'us-en' if english else 'cn-zh'
                results = DDGS(timeout=max(1, min(20, int(remaining)))).images(search_query, region=region, backend='bing', max_results=35)
                reached_search = True
                break
            except Exception:
                logging.info('Retrying garment search after a temporary connection failure')
        products = [row for row in results if re.search(r'item|detail|offer|product|goods|/p/|/prd/|/listing/', row.get('url', ''), re.I)]
        for row in products:
            remaining = query_deadline - time.monotonic()
            if remaining < 1:
                break
            source = row.get('url', '')
            if source in excluded or not matches_garment(row.get('title', ''), kind,
                    constraints.get('color', ''), garment, constraints.get('excluded', []), constraints.get('requiredFeatures', [])):
                continue
            audience_evidence = source_audience_evidence(row.get('title', ''), audience)
            if audience_evidence is None:
                rejected['audience_mismatch'] = rejected.get('audience_mismatch', 0) + 1
                continue
            if row.get('image') in seen_images:
                continue
            seen_images.add(row.get('image'))
            try:
                public_url(source)
                image = garment_image(row['image'], timeout=min(15, remaining))
            except PolicyError as error:
                if error.code in ('moderation_unavailable', 'policy_unavailable'):
                    raise
                logging.info('Skipping garment candidate blocked by image policy: %s', error.code)
                continue
            except Exception as error:
                logging.info('Skipping unavailable garment image %s: %s', row.get('image'), error)
                continue
            paused_at = time.monotonic()
            approved = yield image
            # Do not charge remote review / user retry time to the search budget.
            paused_for = time.monotonic() - paused_at
            deadline += paused_for
            query_deadline += paused_for
            if not approved:
                continue
            title_colors = source_colors(row['title'])
            verification = cloud.garment(base64.b64decode(image.split(',', 1)[1]), {
                'kind': kind, 'constraints': constraints, 'titleColors': title_colors, 'title': row['title'][:200]})
            if verification.get('matched') is not True or verification.get('kind') != kind:
                continue
            seen_colors = verification.get('titleColors')
            verification['titleColors'] = [c for c in title_colors if isinstance(seen_colors, list) and c in seen_colors]
            verification.update(status='matched', method='qwen3-vl-plus')
            return {
                'id': 'web-' + hashlib.sha256(source.encode()).hexdigest()[:16],
                'name': row['title'][:160], 'displayName': source_display_name(row['title'], kind, verification),
                'displayNameSource': 'source-title-and-image', 'visualVerification': verification,
                'audienceVerification': audience_evidence,
                'url': image, 'kind': kind,
                'sourceUrl': source, 'sourceName': urlsplit(source).hostname,
                'photoType': 'auto', 'searchQuery': search_query,
                'constraints': constraints,
            }
    if not reached_search:
        raise JobApiError(503, 'garment_search_unavailable', '网上搜衣暂时不可用，请稍后重试。')
    description = '适合正面试穿的商品图' if kind == 'top' else '能读取图片的商品'
    if rejected:
        color_rejections = sum(rejected.get(code, 0) for code in ('garment_color_mismatch', 'title_image_color_mismatch', 'excluded_garment_color'))
        detail = ('商品标题的适用人群不符合这次需求' if rejected.get('audience_mismatch', 0) >= max(1, color_rejections)
                  else '商品标题与实图颜色未能同时符合要求' if color_rejections else '商品图中的衣物类别或区域不够清晰')
        raise JobApiError(422, 'no_verified_garment', '暂时没有找到核对通过的款式，' + detail + '。可以重试继续找，或上传清晰的正面衣服截图。')
    raise JobApiError(400, 'no_verified_garment', '暂时没有找到符合颜色和款式要求、且' + description + '，请重试或上传衣服截图。')


def first_outfit_reason(pieces, occasion, walking, styles, brief):
    """Explain the two returned garments; a search preference alone is not product evidence."""
    top, bottom = pieces
    upper, lower = top['displayName'], bottom['displayName']
    if occasion:
        first = (f'{occasion}用{upper}显得利落' if '衬衫' in upper else f'{occasion}先用{upper}作上装')
        if walking and '紧身' in bottom['constraints']['excluded']:
            return f'{first}，走路多时搭{lower}，下装避开了紧身款。'
        if '西装外套' in top['constraints']['excluded']:
            return f'{first}，直接搭{lower}，省去你不想穿的西装外套。'
        if '西裤' in lower:
            return f'{first}，配{lower}延续上班的正式感。'
        if '针织' in upper:
            return f'{occasion}选{upper}搭{lower}，针织上装让通勤搭配柔和一些。'
        return f'{first}，用{lower}配成一套通勤装。'
    if walking and '紧身' in bottom['constraints']['excluded']:
        return f'考虑到要多走路，下装先选了{lower}，避开紧身款，上面配{upper}。'
    if '约会' in brief:
        return f'约会用{upper}配{lower}，让上衣成为搭配重点。'
    if re.search(CASUAL_OUTING, brief):
        outing = '周末出门' if '周末' in brief else re.search(CASUAL_OUTING, brief).group()
        if '牛仔' in lower:
            return f'{outing}用{lower}带出休闲感，上面搭{upper}。'
        return f'{outing}这套用{upper}作主搭，下装配{lower}，按日常休闲的方向来选。'
    event = re.search(EVENT_OCCASION, brief)
    if event:
        return f'{event.group()}选{upper}配{lower}，用上衣做搭配重点。'
    if styles:
        return f'按你想要的{styles[0]}风格，用{upper}搭{lower}，先看这两件穿在一起的效果。'
    return f'先用{upper}搭{lower}，两件可以分开换，方便从这套里挑喜欢的单品。'


search_retries = {}
search_retry_lock = threading.Lock()


def prune_candidate_checkpoints():
    with search_retry_lock:
        now = time.monotonic()
        for key in list(search_retries):
            if search_retries[key][0] <= now:
                del search_retries[key]


def search_outfit(payload):
    token = payload.get('reviewToken')
    prune_candidate_checkpoints()
    with search_retry_lock:
        if token:
            entry = search_retries.pop(token, None)
            if not entry:
                raise JobApiError(410, 'review_expired', '候选图已过期，请重新找款。')
            _, payload, slots = entry
        else:
            slots = {}
    try:
        return search_slots(payload, slots)
    except CandidateReviewPaused:
        with search_retry_lock:
            if len(search_retries) >= 12:
                del search_retries[next(iter(search_retries))]
            token = token or secrets.token_hex(16)
            search_retries[token] = (time.monotonic()+600, payload, slots)
        error = JobApiError(503, 'candidate_review_pending', '商品图审核暂时不可用，可以只重试审核。')
        error.details['reviewToken'] = token
        raise error from None


def search_slots(payload, slots):
    request = payload.get('query', '')
    context = payload.get('context', '')
    if not isinstance(request, str) or not isinstance(context, str):
        raise PolicyError('invalid_text', '请用文字描述想试穿的衣服。')
    get_upload_policy().validate_text(context + ' ' + request)
    request = request.strip()[:500]
    context = context.strip()[-1500:]
    if not request:
        raise ValueError('请说说场合、风格或想试的衣服。')
    history = '，'.join(dict.fromkeys(filter(None, (context, request))))[-2000:]
    requested_kind = payload.get('kind')
    completing_outfit = payload.get('completingOutfit') is True
    if completing_outfit and (requested_kind not in ('top', 'bottom') or not context):
        raise ValueError('请指定要补找的上装或下装，并保留原搭配要求。')
    audience = request_audience(history)
    gender = {'children': '童装', 'men': '男装', 'women': '女装'}.get(audience, '')
    new_positive = NEGATIVE_FRAGMENT.sub('', request)
    old_positive = NEGATIVE_FRAGMENT.sub('', context)
    excluded_styles = {word for fragment in NEGATIVE_FRAGMENT.findall(request) for word in STYLE_WORDS if word in fragment}
    styles = [word for word in STYLE_WORDS if word in new_positive and word not in excluded_styles]
    if not styles:
        styles = [word for word in STYLE_WORDS if word in old_positive and word not in excluded_styles]
    positive_history = '，'.join((old_positive, new_positive))
    explicit_garment = any(garment_in(positive_history, kind) for kind in ('top', 'bottom'))
    # A refill searches one slot, using the original first-outfit defaults
    # (e.g. neutral adult clothing or office trousers) rather than edit defaults.
    local_change = requested_kind in ('top', 'bottom') and bool(context) and not completing_outfit
    delegated = re.search(r'都(?:可以|行)|都能穿|随便|随意|无所谓|没(?:有)?特别要求|听你的|你(?:来|帮我)?(?:决定|定|做主|看着搭|挑就行)', new_positive)
    if not (local_change or completing_outfit or styles or re.search(OCCASION_PATTERN, positive_history) or explicit_garment or delegated):
        prompt = '这次主要去哪儿穿？' if payload.get('replyingTo') != 'occasion' else '想按什么场合来搭？还没定的话，可以说“你来定”。'
        return {'clarification': prompt, 'clarificationKind': 'occasion',
                'choices': ['上班通勤', '约会', '周末出门'], 'context': history}
    # A usable style brief is enough for a first outfit. Do not guess who wears
    # men's or women's clothes from an uploaded portrait or from a work event.
    if audience == 'adult' and not local_change:
        audience = 'neutral'
        gender = '成人 中性'
    work_match = re.search(WORK_OCCASION, positive_history)
    occasion = work_match.group() if work_match else None
    walking = bool(re.search(WALKING, positive_history))
    if not styles and occasion and '通勤' not in excluded_styles:
        styles = ['通勤']
    queries = []
    for kind in ('top', 'bottom'):
        if requested_kind in ('top', 'bottom') and kind != requested_kind:
            continue
        refill_garment = None
        if completing_outfit:
            original = payload.get('missingGarment')
            refill_garment = original if any(original == label for label, _ in GARMENT_INPUTS[kind]) else ''
        old = request_constraints(context, kind, refill_garment)
        new = request_constraints(request, kind)
        if completing_outfit and identifies_slot(new['garment'], new['positive'], old['garment']):
            new['garment'] = ''
        unsupported = new['unsupportedColors'] or (old['unsupportedColors'] if not new['color'] else [])
        if unsupported:
            raise JobApiError(422, 'unsupported_garment_color', '暂时无法可靠核对“' + unsupported[0] + '”这种具体颜色。请换成常见颜色重试，或直接上传你选好的衣服图。')
        constraints = {
            'audience': audience,
            'color': new['color'] or old['color'],
            'garment': new['garment'] or old['garment'],
            'excluded': list(dict.fromkeys(old['excluded'] + new['excluded'])),
            'requiredFeatures': list({**old['features'], **new['features']}.values()),
        }
        positive_request = new['positive']
        constraints['excluded'] = [name for name in constraints['excluded']
            if not re.search(constraint_pattern(name), positive_request, re.I)]
        constraints['requiredFeatures'] = [name for name in constraints['requiredFeatures'] if name not in constraints['excluded']]
        if not constraints['garment']:
            if kind == 'top':
                first = '衬衫'
                if re.search(r'秋|冬|保暖|冷|约会', positive_history):
                    first = '针织衫'
                elif not local_change and not occasion and re.search(CASUAL_OUTING, positive_history):
                    first = 'T恤'
                candidates = (first, '衬衫', '针织衫', 'T恤', '外套')
            else:
                first = '牛仔裤' if re.search(CASUAL_OUTING + r'|休闲|牛仔', positive_history) else '直筒长裤'
                if occasion and not walking and not local_change:
                    first = '西裤'
                candidates = (first, '直筒长裤', '休闲裤', '牛仔裤', '半身裙')
            constraints['garment'] = next((g for g in candidates if not any(
                re.search(constraint_pattern(name), g, re.I) for name in constraints['excluded'])), '')
            if not constraints['garment']:
                return {'clarification': '这次想搭哪种' + ('上衣' if kind == 'top' else '下装') + '？', 'context': history}
        if not local_change and kind == 'bottom':
            if walking and not re.search(constraint_pattern('紧身'), positive_history, re.I):
                constraints['excluded'].append('紧身')
            if (occasion and not walking and constraints['garment'] == '直筒长裤'
                    and not re.search(r'直筒|长裤', positive_history) and '西裤' not in constraints['excluded']):
                constraints['garment'] = '西裤'
            if (walking and constraints['garment'] == '直筒长裤' and not (old['features'].get('cut') or new['features'].get('cut'))
                    and '直筒' not in constraints['excluded']):
                constraints['requiredFeatures'].append('直筒')
        simple_comfort = occasion or walking or re.search(r'简约|舒适|舒服|日常|看展|周末', positive_history)
        if simple_comfort:
            for name in ('透视', '情趣', '破洞'):
                if not re.search(FEATURE_PATTERNS[name], old['positive'] + positive_request, re.I):
                    constraints['excluded'].append(name)
        constraints['excluded'] = list(dict.fromkeys(constraints['excluded']))
        image_terms = '正面 商品图'
        positive = ' '.join(filter(None, [gender or '成人服装', ' '.join(styles), constraints['color'],
                                         ' '.join(constraints['requiredFeatures']), constraints['garment'], image_terms]))
        query = positive + ''.join(' -' + name for name in constraints['excluded'])
        queries.append({'kind': kind, 'query': query, 'constraints': constraints})
    excluded_sources = set(payload.get('exclude', []))
    with ThreadPoolExecutor(max_workers=2) as pool:
        def finish_slot(query,kind,excluded,constraints):
            previous = slots.get(kind)
            if isinstance(previous, dict):
                return previous
            if isinstance(previous, JobApiError):
                raise previous
            try:
                if isinstance(previous, CandidateReviewPaused):
                    # Clearing the traceback avoids retaining an entire previous request.
                    piece = finish_candidate_review(previous.candidates, previous.image)
                else:
                    piece = find_garment(query,kind,excluded,constraints)
            except CandidateReviewPaused as pending:
                slots[kind] = CandidateReviewPaused(pending.candidates,pending.image)
                raise
            except JobApiError as error:
                slots[kind] = JobApiError(error.status,error.code,str(error))
                raise
            slots[kind] = piece
            return piece
        futures = [pool.submit(finish_slot, item['query'], item['kind'], excluded_sources, item['constraints']) for item in queries]
        pieces = []
        failures = []
        for item, future in zip(queries, futures):
            try:
                pieces.append(future.result())
            except JobApiError as error:
                if error.code not in ('no_verified_garment', 'garment_search_unavailable'):
                    raise
                failures.append((item['kind'], error))
    if not pieces:
        error = failures[0][1]
        if completing_outfit:
            error.details['missingGarment'] = queries[0]['constraints']['garment']
        raise error
    result = {'pieces': pieces, 'context': history, 'queries': queries}
    if failures:
        result['missingKind'] = failures[0][0]
    elif len(pieces) == 2:
        result['outfitReason'] = first_outfit_reason(pieces, occasion, walking, styles, positive_history)
    return result


class JobCancelled(Exception):
    pass


class JobApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = {}


def policy_error_status(error):
    unavailable = ('moderation_unavailable', 'policy_unavailable')
    invalid = ('invalid_text', 'text_too_long', 'invalid_image', 'invalid_image_role',
               'image_too_large', 'unsupported_image_format', 'image_dimensions_exceeded', 'animated_image')
    return 503 if error.code in unavailable else 400 if error.code in invalid else 422


def check_cancelled(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise JobCancelled()


def review_with_retry(data, role, cancel_event):
    for attempt in range(3):
        check_cancelled(cancel_event)
        try:
            return get_upload_policy().check_image(data, role)
        except PolicyError as error:
            if error.code != 'moderation_unavailable' or attempt == 2:
                raise
            logging.info('Retrying cloud review of %s, attempt %d', role, attempt+2)
            if cancel_event is None:
                time.sleep(2 ** attempt)
            else:
                cancel_event.wait(2 ** attempt)


def prepare_tryon(payload, cancel_event=None):
    policy = get_upload_policy()
    check_cancelled(cancel_event)
    policy.validate_text(payload.get('requestText', ''))
    check_cancelled(cancel_event)
    portrait_bytes = upload_bytes(payload.get('person'))
    check_cancelled(cancel_event)
    check_cancelled(cancel_event)
    person = portrait_bytes
    garments = payload['garments']
    preserve = payload.get('preserve', False)
    if not isinstance(preserve, bool):
        raise ValueError('局部试穿参数无效。')
    if not isinstance(garments, list) or not 1 <= len(garments) <= 4:
        raise ValueError('请选择一至四件衣物。')
    inputs = []
    for item in garments:
        check_cancelled(cancel_event)
        if item['category'] not in ('tops', 'bottoms'):
            raise ValueError('请选择衣物类别。')
        photo_type = item.get('photoType', 'auto')
        if photo_type not in ('auto', 'model', 'flat-lay'):
            raise ValueError('衣物图片类型无效。')
        garment_bytes = upload_bytes(item.get('image'))
        check_cancelled(cancel_event)
        check_cancelled(cancel_event)
        inputs.append((item['category'], garment_bytes, photo_type))
    checks = [(person,'portrait')] + [(image,'garment') for _,image,_ in inputs]
    with ThreadPoolExecutor(max_workers=min(3,len(checks))) as pool:
        futures = [pool.submit(review_with_retry, data,role,cancel_event) for data,role in dict.fromkeys(checks)]
        for future in futures:
            future.result()
    with Image.open(io.BytesIO(person)) as original:
        dims = payload.get('portraitDimensions', list(original.size))
    if not isinstance(dims, list) or len(dims) != 2 or not all(type(v) is int and 0 < v <= 65535 for v in dims):
        raise ValueError('人物原照尺寸无效。')
    return person, inputs, payload.get('requestText',''), cloud.portrait_output_size(*dims)


class OutputReviewPaused(PolicyError):
    def __init__(self, data, remaining, request_text, size):
        super().__init__('output_review_pending', '成图已暂存，请重试审核。')
        self.resume = (data, remaining, request_text, size)


def render_locked(renderer, prepared, cancel_event=None, report=None, resume_review=False):
    person, inputs, request_text, size = prepared
    def review_output(data, remaining):
        if report:
            report('reviewing', '正在审核云端试穿结果。')
        try:
            review_with_retry(data, 'output', cancel_event)
        except PolicyError as error:
            if error.code == 'moderation_unavailable':
                raise OutputReviewPaused(data, remaining, request_text, size) from None
            raise
    if resume_review:
        review_output(person, inputs)
    for index, (category, image, photo_type) in enumerate(inputs, 1):
        check_cancelled(cancel_event)
        if report:
            report('generating', f'正在生成第 {index} / {len(inputs)} 件试穿效果。')
        try:
            person = cloud.try_on(person, image, category, photo_type, request_text, size)
        except cloud.CloudError as error:
            raise JobApiError(503, 'cloud_tryon_failed', str(error)) from None
        check_cancelled(cancel_event)
        review_output(person, inputs[index:])
    return person


@dataclass
class TryOnJob:
    id: str
    payload: dict | None
    input_bytes: int
    updated_at: float
    status: str = 'queued'
    stage: str = 'queued'
    message: str = '已排队，等待开始。'
    cancel_event: threading.Event = field(default_factory=threading.Event)
    running: bool = False
    image: bytes | None = None
    review_checkpoint: tuple | None = None
    progress: dict | None = None
    error: str | None = None
    code: str | None = None
    http_status: int | None = None


class TryOnJobs:
    TERMINAL = {'done', 'cancelled', 'error'}

    def __init__(self, renderer, *, max_jobs=32, max_active=4, max_bytes=64 * 1024 * 1024, ttl=1800):
        self.renderer = renderer
        self.max_jobs = max_jobs
        self.max_active = max_active
        self.max_bytes = max_bytes
        self.ttl = ttl
        self.jobs = {}
        self.lock = threading.Lock()
        self.queue = queue.Queue(maxsize=max_jobs)
        self.stopped = threading.Event()
        self.worker = threading.Thread(target=self._work, name='tryon-jobs', daemon=True)
        self.worker.start()

    def _stored_bytes(self):
        return sum(job.input_bytes + len(job.image or b'') for job in self.jobs.values())

    def _prune(self, needed_bytes=0, need_slot=False):
        now = time.monotonic()
        terminal = sorted((job for job in self.jobs.values() if job.status in self.TERMINAL and not job.running),
                          key=lambda job: job.updated_at)
        for job in terminal:
            if now - job.updated_at >= self.ttl or self._stored_bytes() + needed_bytes > self.max_bytes or (need_slot and len(self.jobs) >= self.max_jobs):
                self.jobs.pop(job.id, None)

    @staticmethod
    def _snapshot(job):
        data = {'id': job.id, 'status': job.status, 'stage': job.stage, 'message': job.message}
        if job.progress is not None:
            data['progress'] = dict(job.progress)
        if job.status == 'done' and not job.cancel_event.is_set():
            data['imageUrl'] = f'/api/try-on/jobs/{job.id}/image'
        if job.error:
            data.update(error=job.error, code=job.code, httpStatus=job.http_status)
        return data

    def _job(self, job_id):
        job = self.jobs.get(job_id)
        if job is None:
            raise JobApiError(404, 'job_not_found', '生成任务已过期或不存在，请重新生成。')
        return job

    def create(self, payload, payload_size):
        with self.lock:
            if not isinstance(payload_size, int) or not 0 < payload_size <= 32 * 1024 * 1024:
                raise JobApiError(400, 'invalid_request', '请求内容无效，请重新提交。')
            if self.stopped.is_set():
                raise JobApiError(503, 'jobs_unavailable', '生成服务正在重启，请稍后重试。')
            self._prune(payload_size, True)
            active = sum(job.running or job.status not in self.TERMINAL for job in self.jobs.values())
            if active >= self.max_active or len(self.jobs) >= self.max_jobs or self._stored_bytes() + payload_size > self.max_bytes:
                raise JobApiError(429, 'queue_full', '生成任务较多，请稍后重试。')
            now = time.monotonic()
            job = TryOnJob(secrets.token_hex(16), payload, payload_size, now)
            self.jobs[job.id] = job
            try:
                self.queue.put_nowait(job.id)
            except queue.Full:
                self.jobs.pop(job.id, None)
                raise JobApiError(429, 'queue_full', '生成任务较多，请稍后重试。')
            return self._snapshot(job)

    def retry_review(self, job_id):
        with self.lock:
            self._prune()
            job = self._job(job_id)
            if job.status == 'error' and job.review_checkpoint and not job.running:
                try:
                    self.queue.put_nowait(job.id)
                except queue.Full:
                    raise JobApiError(429, 'queue_full', '队列已满，稍后可继续审核。') from None
                job.status = job.stage = 'queued'
                job.message = '已排队，只重试成图审核。'
                job.error = job.code = job.http_status = None
                job.updated_at = time.monotonic()
            return self._snapshot(job)

    def get(self, job_id):
        with self.lock:
            self._prune()
            return self._snapshot(self._job(job_id))

    def image(self, job_id):
        with self.lock:
            self._prune()
            job = self._job(job_id)
            if job.cancel_event.is_set() or job.status == 'cancelled':
                raise JobApiError(410, 'job_cancelled', '本次生成已取消。')
            if job.status != 'done' or job.image is None:
                raise JobApiError(409, 'image_not_ready', '图片尚未生成完成，请稍后重试。')
            return job.image

    def cancel(self, job_id):
        with self.lock:
            self._prune()
            job = self._job(job_id)
            job.cancel_event.set()
            job.status = job.stage = 'cancelled'
            job.image = None
            job.review_checkpoint = None
            job.error = job.code = job.http_status = None
            job.updated_at = time.monotonic()
            if job.running:
                job.message = '已取消，当前处理步骤结束后释放生成资源。'
            else:
                job.message = '已取消本次生成。'
                job.payload = None
                job.input_bytes = 0
            return self._snapshot(job)

    def _update(self, job, status, message, progress=None):
        with self.lock:
            check_cancelled(job.cancel_event)
            job.status = job.stage = status
            job.message = message
            job.progress = progress
            job.updated_at = time.monotonic()

    def _fail(self, job, error, code, http_status):
        with self.lock:
            if job.cancel_event.is_set():
                return
            job.status = 'error'
            job.error = job.message = error
            job.code = code
            job.http_status = http_status
            job.updated_at = time.monotonic()

    def _work(self):
        while not self.stopped.is_set():
            try:
                job_id = self.queue.get(timeout=.5)
            except queue.Empty:
                prune_candidate_checkpoints()
                with self.lock:
                    self._prune()
                continue
            try:
                with self.lock:
                    job = self.jobs.get(job_id)
                    if job is None or job.cancel_event.is_set():
                        continue
                    job.running = True
                self._run(job)
            finally:
                self.queue.task_done()
                job = None

    def _run(self, job):
        acquired = False
        try:
            while not acquired:
                check_cancelled(job.cancel_event)
                acquired = self.renderer.acquire(timeout=.25)
            check_cancelled(job.cancel_event)
            resuming = job.review_checkpoint is not None
            if resuming:
                prepared = job.review_checkpoint
            else:
                self._update(job, 'checking', '正在检查本人照和衣服图。')
                prepared = prepare_tryon(job.payload, job.cancel_event)
            with self.lock:
                job.payload = None
                job.input_bytes = 0
            report = lambda status, message, progress=None: self._update(job, status, message, progress)
            data = render_locked(self.renderer, prepared, job.cancel_event, report, resuming)
            with self.lock:
                check_cancelled(job.cancel_event)
                self._prune(len(data))
                if self._stored_bytes() + len(data) > self.max_bytes:
                    raise JobApiError(503, 'result_capacity', '生成任务较多，请稍后重试。')
                job.image = data
                job.status = job.stage = 'done'
                job.message = '试穿图片已生成。'
                job.updated_at = time.monotonic()
        except JobCancelled:
            pass
        except OutputReviewPaused as error:
            with self.lock:
                if not job.cancel_event.is_set():
                    job.review_checkpoint = error.resume
                    job.input_bytes = len(error.resume[0])+sum(len(image) for _,image,_ in error.resume[1])
            self._fail(job, str(error), error.code, 503)
        except PolicyError as error:
            self._fail(job, str(error), error.code, policy_error_status(error))
        except JobApiError as error:
            self._fail(job, str(error), error.code, error.status)
        except (ValueError, TypeError, KeyError, OSError):
            if job.stage == 'checking':
                self._fail(job, '素材无法读取，请重新上传本人照和衣服图。', 'invalid_input', 400)
            else:
                logging.exception('Try-on job processing failed')
                self._fail(job, '试穿生成失败，可以重试这一套。', 'generation_failed', 500)
        except Exception:
            logging.exception('Try-on job failed')
            self._fail(job, '试穿生成失败，可以重试这一套。', 'generation_failed', 500)
        finally:
            if acquired:
                self.renderer.release()
            with self.lock:
                job.payload = None
                if job.code != 'output_review_pending' or job.cancel_event.is_set():
                    job.review_checkpoint = None
                    job.input_bytes = 0
                job.running = False
                if job.cancel_event.is_set():
                    job.status = job.stage = 'cancelled'
                    job.image = None
                    job.message = '已取消本次生成。'
                    job.updated_at = time.monotonic()

    def shutdown(self):
        with self.lock:
            ids = list(self.jobs)
        for job_id in ids:
            try:
                self.cancel(job_id)
            except JobApiError:
                pass
        self.stopped.set()
        self.worker.join(timeout=2)


class Handler(SimpleHTTPRequestHandler):
    def same_origin(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host in self.server.allowed_hosts and (not origin or origin == 'http://' + host)

    def json_response(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def policy_error(self, error):
        return self.json_response(policy_error_status(error), {'error': str(error), 'code': error.code})

    def job_error(self, error):
        return self.json_response(error.status, {'error': str(error), 'code': error.code, **error.details})

    def send_image(self, data, mime="image/webp"):
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.same_origin():
            return self.send_error(403)
        job_path = re.fullmatch(r'/api/try-on/jobs/([a-f0-9]{32})(/image)?', urlsplit(self.path).path)
        if job_path:
            try:
                if job_path[2]:
                    return self.send_image(self.server.tryon_jobs.image(job_path[1]))
                return self.json_response(200, self.server.tryon_jobs.get(job_path[1]))
            except JobApiError as error:
                return self.job_error(error)
        if urlsplit(self.path).path == '/api/health':
            try:
                version = get_upload_policy().version
            except PolicyError as error:
                return self.policy_error(error)
            return self.json_response(200, {'tryOn': cloud.configured(), 'model': cloud.image_model(), 'inference': getattr(cloud, 'INFERENCE_MODE', 'custom' if cloud.__name__ != 'aliyun_services' else 'cloud-only'), 'search': True, 'policyVersion': version})
        return super().do_GET()

    def do_POST(self):
        if not self.same_origin():
            return self.send_error(403)
        if self.path == '/api/portrait':
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 32 * 1024 * 1024:
                    raise ValueError()
                with Image.open(io.BytesIO(self.rfile.read(length))) as source:
                    if (source.format not in ('JPEG', 'PNG', 'WEBP', 'HEIF', 'AVIF')
                            or source.width * source.height > 60_000_000 or getattr(source, 'is_animated', False)):
                        raise ValueError()
                    image = ImageOps.exif_transpose(source)
                    image.thumbnail((1400, 1400))
                    out = io.BytesIO()
                    image.convert('RGB').save(out, 'JPEG', quality=94)
                data = out.getvalue()
                review_with_retry(data, 'portrait', None)
                return self.send_image(data, 'image/jpeg')
            except PolicyError as error:
                return self.policy_error(error)
            except (OSError, ValueError, Image.DecompressionBombError):
                return self.json_response(400, {'error': '照片无法读取，请选择单张静态照片（最大 32 MB、6000 万像素）。'})
        retry = re.fullmatch(r'/api/try-on/jobs/([a-f0-9]{32})/review', urlsplit(self.path).path)
        if retry:
            try:
                return self.json_response(200,self.server.tryon_jobs.retry_review(retry[1]))
            except JobApiError as error:
                return self.job_error(error)
        cancel_path = re.fullmatch(r'/api/try-on/jobs/([a-f0-9]{32})/cancel', self.path)
        if cancel_path:
            try:
                return self.json_response(200, self.server.tryon_jobs.cancel(cancel_path[1]))
            except JobApiError as error:
                return self.job_error(error)
        if self.path not in ('/api/try-on', '/api/try-on/jobs', '/api/search-garments', '/api/check-upload', '/api/plan'):
            return self.json_response(404, {'error': '接口不存在。'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if self.headers.get_content_type() != 'application/json' or not 0 < length <= 32 * 1024 * 1024:
                raise ValueError('请求内容无效。')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('请求内容无效。')
            if self.path == '/api/try-on/jobs':
                return self.json_response(202, self.server.tryon_jobs.create(payload, length))
            if self.path == '/api/plan':
                get_upload_policy().validate_text(payload.get('query', ''))
                if len(json.dumps(payload)) > 32000:
                    raise ValueError('搭配上下文过长。')
                return self.json_response(200, cloud.plan(payload))
            if self.path == '/api/check-upload':
                role = payload.get('role')
                if role not in ('portrait', 'garment'):
                    raise PolicyError('invalid_image_role', '图片用途无效，请重新选择本人照或服装图。')
                data = upload_bytes(payload.get('image'))
                metadata = review_with_retry(data, role, None)
                if role == 'garment':
                    identified = cloud.garment(data)
                    if identified.get('kind') in ('top', 'bottom'):
                        metadata['garmentKind'] = identified['kind']
                    if identified.get('photoType') in ('model', 'flat-lay'):
                        metadata['photoType'] = identified['photoType']
                return self.json_response(200, {'metadata': metadata})
            if self.path == '/api/search-garments':
                return self.json_response(200, search_outfit(payload))
            prepared = prepare_tryon(payload)
        except JobApiError as error:
            return self.job_error(error)
        except PolicyError as error:
            return self.policy_error(error)
        except cloud.CloudError as error:
            return self.json_response(503, {'error': str(error), 'code': 'cloud_unavailable'})
        except json.JSONDecodeError:
            return self.json_response(400, {'error': '请求内容无法读取，请重新提交。'})
        except (ValueError, TypeError, KeyError, OSError) as error:
            message = str(error) if self.path == '/api/search-garments' and isinstance(error, ValueError) else '素材无法读取，请重新上传本人照和衣服图。'
            return self.json_response(400, {'error': message})
        except Exception:
            logging.exception('Garment search failed')
            return self.json_response(502, {'error': '服装搜索暂时未完成，请重试或上传衣服截图。'})
        try:
            renderer = self.server.renderer
            with renderer:
                data = render_locked(renderer, prepared)
        except PolicyError as error:
            return self.policy_error(error)
        except JobApiError as error:
            return self.job_error(error)
        except Exception:
            logging.exception('Try-on failed')
            return self.json_response(500, {'error': '试穿生成失败，可以重试这一套。'})
        return self.send_image(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=18793)
    parser.add_argument('--allowed-host', action='append', default=[], help='Additional preview hostname or LAN address')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(ROOT / 'dist')))
    server.allowed_hosts = {f'{host}:{args.port}' for host in (args.host, '127.0.0.1', 'localhost', *args.allowed_host)}
    server.renderer = threading.Lock()
    server.tryon_jobs = TryOnJobs(server.renderer)
    print(f'Demo running at http://{args.host}:{args.port}', flush=True)
    try:
        server.serve_forever()
    finally:
        server.tryon_jobs.shutdown()
        server.server_close()
