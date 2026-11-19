"""Exercise a separately loaded provider through the real HTTP entry points."""
import base64
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = """
from io import BytesIO
from PIL import Image
class CloudError(Exception):
    pass
INFERENCE_MODE = 'local'
def configured():
    return True
def image_model():
    return 'test-provider'
def moderate(data):
    return 'none'
def garment(data, criteria=None):
    return {'kind':'top', 'photoType':'flat-lay', 'category':'top', 'matched':True}
def plan(context):
    return {'action':'new', 'kind':'top', 'query':context['query']}
def portrait_output_size(width, height):
    return f'{width}*{height}'
def try_on(person, garment_data, category, photo_type, request_text, size):
    # Fixture output verifies transport and sequential inputs, not AI quality.
    with Image.open(BytesIO(person)) as original:
        output = original.convert('RGB')
    color = 'red' if category == 'tops' else 'blue'
    output.putpixel((0, 0), Image.new('RGB', (1, 1), color).getpixel((0, 0)))
    result = BytesIO()
    output.save(result, 'WEBP', lossless=True)
    return result.getvalue()
"""
BOOT = """
from functools import partial
import os
import threading
import serve_demo as app
app._upload_policy = app.UploadPolicy(os.environ['TEST_POLICY_PATH'])
server = app.ThreadingHTTPServer(('127.0.0.1', 0), partial(app.Handler, directory=str(app.ROOT / 'dist')))
port = server.server_port
server.allowed_hosts = {f'127.0.0.1:{port}'}
server.renderer = threading.Lock()
server.tryon_jobs = app.TryOnJobs(server.renderer)
print(port, flush=True)
server.serve_forever()
"""


class ProviderHttpTests(unittest.TestCase):
    def test_custom_provider_end_to_end(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'test_models.py').write_text(FIXTURE)
            policy = folder / '提示词' / 'policy.md'
            policy.parent.mkdir()
            shutil.copyfile(ROOT / '提示词/上传审核与试穿约束.md', policy)
            environment = dict(os.environ, TRYON_PROVIDER_MODULE='test_models',
                               PYTHONPATH=str(folder), TEST_POLICY_PATH=str(policy))
            for key in ('DASHSCOPE_API_KEY', 'BAILIAN_WORKSPACE_ID',
                        'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'):
                environment.pop(key, None)
            with tempfile.TemporaryFile(mode='w+') as log:
                process = subprocess.Popen([sys.executable, '-u', '-c', BOOT], cwd=ROOT,
                                           env=environment, stdout=log, stderr=log)
                try:
                    port = None
                    for _ in range(100):
                        log.seek(0)
                        first_line = log.readline().strip()
                        if first_line.isdigit():
                            port = int(first_line)
                            break
                        if process.poll() is not None:
                            self.fail('Test server failed: ' + first_line + log.read())
                        time.sleep(.05)
                    self.assertIsNotNone(port, 'Test server did not start')
                    base = f'http://127.0.0.1:{port}'

                    def call(path, value=None, raw=False):
                        data = value if raw else json.dumps(value).encode() if value is not None else None
                        request = Request(base + path, data=data,
                                          headers={'Content-Type': 'image/jpeg' if raw else 'application/json'})
                        with urlopen(request, timeout=5) as response:
                            payload = response.read()
                            if response.headers.get_content_type() == 'application/json':
                                return json.loads(payload)
                            return payload

                    health = call('/api/health')
                    self.assertTrue(health['tryOn'])
                    self.assertEqual(health['model'], 'test-provider')
                    self.assertEqual(health['inference'], 'local')
                    self.assertIn(b'<html', call('/collections/'))
                    stream = BytesIO()
                    Image.new('RGB', (64, 64), 'white').save(stream, 'JPEG')
                    portrait = call('/api/portrait', stream.getvalue(), raw=True)
                    encoded = base64.b64encode(portrait).decode()
                    checked = call('/api/check-upload', {'image': encoded, 'role': 'garment'})
                    self.assertEqual(checked['metadata']['garmentKind'], 'top')
                    self.assertEqual(call('/api/plan', {'query': '换一件衬衫'})['action'], 'new')
                    job = call('/api/try-on/jobs', {
                        'person': encoded, 'portraitDimensions': [64, 64],
                        'garments': [{'category': category, 'image': encoded}
                                     for category in ('tops', 'bottoms')],
                    })
                    for _ in range(100):
                        status = call('/api/try-on/jobs/' + job['id'])
                        if status['status'] in ('done', 'error'):
                            break
                        time.sleep(.05)
                    self.assertEqual(status['status'], 'done', status)
                    output = call('/api/try-on/jobs/' + job['id'] + '/image')
                    with Image.open(BytesIO(output)) as image:
                        self.assertEqual(image.format, 'WEBP')
                        self.assertEqual(image.size, (64, 64))
                        self.assertEqual(image.convert('RGB').getpixel((0, 0)), (0, 0, 255))
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
