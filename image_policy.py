"""Load the documented upload policy and apply local file, text and exposure checks."""
from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import re
import hashlib
import sqlite3
from contextlib import closing
import time
from model_provider import cloud
import unicodedata

from PIL import Image, ImageOps, UnidentifiedImageError


class PolicyError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class UploadPolicy:
    """A shared instance serializes detector initialization and local ONNX inference."""

    def __init__(self, document_path):
        self.db_path = Path(document_path).resolve().parent.parent / '.runtime' / 'passed-reviews.sqlite3'
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS passed (role TEXT, version TEXT, digest BLOB, expires REAL, PRIMARY KEY(role,version,digest))')
        self.document_path = Path(document_path)
        try:
            document = self.document_path.read_text(encoding="utf-8")
            block = re.search(r"```json\s*\n(.*?)\n```", document, re.DOTALL)
            if block is None:
                raise ValueError("Missing policy configuration")
            self.config = json.loads(block.group(1))
            self.version = self.config["version"]
            self.file_rules = self.config["file_rules"]
            self.exposure_rules = self.config["exposure_rules"]
            self.text_rules = [
                (item["code"], re.compile(item["pattern"], re.IGNORECASE), item["message"])
                for item in self.config["blocked_text_rules"]
            ]
            threshold = self.exposure_rules["threshold"]
            if not 0 <= threshold <= 1:
                raise ValueError("Invalid exposure threshold")
            if not self.file_rules["allowed_formats"] or not self.file_rules["allowed_roles"]:
                raise ValueError("Empty upload policy")
            for key in ("max_bytes", "max_pixels", "max_edge"):
                if not isinstance(self.file_rules[key], int) or self.file_rules[key] <= 0:
                    raise ValueError("Invalid image limit")
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise PolicyError("policy_unavailable", "上传规则暂时无法读取，请稍后重试。") from error


    @staticmethod
    def _negated(text, start, end):
        # A later affirmative clause must still be checked even after a refusal.
        if re.search(r"但是|不过|而是|反而|\b(?:but|however|instead)\b", text[start:end], re.IGNORECASE):
            return False
        prefix = text[max(0, start - 96):start]
        chinese = re.search(
            r"(?:不要|别|请勿|禁止|避免|拒绝|不需要|不能|不做|不生成|不包含|不接受)"
            r"(?:\s*(?:再|去|给|进行|生成|制作|出现|包含|有|任何|这类|这种|把|让|她|他|人物|这个人|这张照片|图中人物|照片里的她|照片里的他|色情|裸体|裸露|性化|挑逗))*\s*$",
            prefix,
        )
        english = re.search(
            r"\b(?:do\s+not|don['’]?t|no|never|avoid|without|not)\s+"
            r"(?:(?:generate|create|show|make|render|add|include|produce|give|expose|"
            r"her|him|them|person|people|a|the|this|that|any|image|images|picture|pictures|"
            r"of|with|sexualize|sexualise|sexualization|sexualisation|porn|pornography|"
            r"nudity|nude|naked|sexy|erotic|or|and)\s+)*$",
            prefix, re.IGNORECASE,
        )
        return bool(chinese or english)

    def validate_text(self, text):
        if text is None:
            text = ""
        if not isinstance(text, str):
            raise PolicyError("invalid_text", "请用文字描述想试穿的衣服。")
        normalized = unicodedata.normalize("NFKC", text)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if len(normalized) > self.config["max_text_length"]:
            raise PolicyError("text_too_long", "描述有些长，请保留这次穿搭最重要的要求。")
        for code, pattern, message in self.text_rules:
            for match in pattern.finditer(normalized):
                if not self._negated(normalized, match.start(), match.end()):
                    raise PolicyError(code, message)
        return {"policy_version": self.version, "text_checked": True}

    def check_image(self, data, role):
        if role not in self.file_rules["allowed_roles"]:
            raise PolicyError("invalid_image_role", "图片用途无效，请重新选择本人照或服装图。")
        if not isinstance(data, (bytes, bytearray, memoryview)) or not data:
            raise PolicyError("invalid_image", "图片无法读取，请重新选择。")
        if len(data) > self.file_rules["max_bytes"]:
            raise PolicyError("image_too_large", "单张图片请控制在 10MB 以内。")
        data = bytes(data)
        key = (role, self.version, hashlib.sha256(data).digest())
        try:
            with Image.open(BytesIO(data)) as source:
                image_format = source.format
                width, height = source.size
                if image_format not in self.file_rules["allowed_formats"]:
                    raise PolicyError("unsupported_image_format", "请上传 JPG、PNG 或 WebP 图片。")
                if width * height > self.file_rules["max_pixels"] or max(width, height) > self.file_rules["max_edge"]:
                    raise PolicyError("image_dimensions_exceeded", "图片尺寸过大，请缩小后重新上传。")
                if getattr(source, "is_animated", False) and not self.file_rules["allow_animated"]:
                    raise PolicyError("animated_image", "请上传一张静态照片或服装图。")
                source.load()
                image = ImageOps.exif_transpose(source).convert("RGB")
                width, height = image.size
        except PolicyError:
            raise
        except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
            raise PolicyError("invalid_image", "图片无法完整读取，请重新选择。") from error

        # Normalize orientation before detection. Face labels are never used to infer age or sex.
        image.thumbnail((1600, 1600))
        normalized = BytesIO()
        image.save(normalized, format="JPEG", quality=92)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            hit = db.execute('SELECT 1 FROM passed WHERE role=? AND version=? AND digest=? AND expires>?', (*key,time.time())).fetchone()
        if not hit:
            try:
                risk = cloud.moderate(normalized.getvalue())
            except cloud.CloudError as error:
                raise PolicyError('moderation_unavailable', str(error)) from None
            if risk != 'none':
                raise PolicyError('image_review_flagged', '阿里云图片审核提示风险，请换一张图片。')
            with closing(sqlite3.connect(self.db_path)) as db, db:
                db.execute('DELETE FROM passed WHERE expires<=?', (time.time(),))
                db.execute('INSERT OR REPLACE INTO passed VALUES (?,?,?,?)', (*key,time.time()+1800))
        metadata = {
            "policy_version": self.version,
            "role": role,
            "format": image_format,
            "width": width,
            "height": height,
            "bytes": len(data),
            "checks": ["image_file", "aliyun_image_review"],
        }
        return metadata
