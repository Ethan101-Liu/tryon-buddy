"""Select the backend adapter before serving requests."""
import importlib
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / '.runtime/cloud.env', interpolate=False)

REQUIRED_FUNCTIONS = (
    'plan', 'garment', 'moderate', 'portrait_output_size',
    'try_on', 'configured', 'image_model',
)


def load_provider():
    name = os.environ.get('TRYON_PROVIDER_MODULE') or 'aliyun_services'
    try:
        provider = importlib.import_module(name)
    except ImportError as error:
        raise RuntimeError(
            f'无法加载模型适配模块 {name}。请检查模块路径及其依赖。'
        ) from error
    missing = [name for name in REQUIRED_FUNCTIONS if not callable(getattr(provider, name, None))]
    error_type = getattr(provider, 'CloudError', None)
    if not isinstance(error_type, type) or not issubclass(error_type, Exception):
        missing.append('CloudError')
    if missing:
        raise RuntimeError('模型适配模块缺少接口：' + ', '.join(missing))
    return provider


cloud = load_provider()
