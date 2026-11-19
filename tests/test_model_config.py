import os
import unittest
from unittest.mock import patch

import aliyun_services as cloud


class ModelConfigTests(unittest.TestCase):
    def test_default_models_and_missing_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(cloud.vision_model(), 'qwen3-vl-plus')
            self.assertEqual(cloud.image_model(), 'qwen-image-3.0')
            self.assertFalse(cloud.configured())

    def test_configured_models_reach_requests(self):
        config = {
            'DASHSCOPE_API_KEY': 'test-key',
            'BAILIAN_WORKSPACE_ID': 'test-workspace',
            'QWEN_VISION_MODEL': 'custom-vision',
            'QWEN_IMAGE_MODEL': 'custom-image',
        }
        with patch.dict(os.environ, config, clear=True), patch.object(cloud.requests, 'post') as post:
            post.return_value.ok = False
            with self.assertRaises(cloud.CloudError):
                cloud.qwen('instruction', {})
            self.assertEqual(post.call_args.kwargs['json']['model'], 'custom-vision')
            with patch.object(cloud, 'image_uri', return_value='data:image/png;base64,'):
                with self.assertRaises(cloud.CloudError):
                    cloud.try_on(b'person', b'garment', 'tops', 'model', '', '832*660')
            self.assertEqual(post.call_args.kwargs['json']['model'], 'custom-image')

    def test_configured_requires_all_credentials(self):
        keys = ('DASHSCOPE_API_KEY', 'BAILIAN_WORKSPACE_ID',
                'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET')
        with patch.dict(os.environ, dict.fromkeys(keys, 'test-value'), clear=True):
            self.assertTrue(cloud.configured())
            os.environ['ALIBABA_CLOUD_ACCESS_KEY_SECRET'] = ''
            self.assertFalse(cloud.configured())

    def test_empty_model_settings_keep_defaults(self):
        with patch.dict(os.environ, {'QWEN_VISION_MODEL': '', 'QWEN_IMAGE_MODEL': ''}, clear=True):
            self.assertEqual(cloud.vision_model(), 'qwen3-vl-plus')
            self.assertEqual(cloud.image_model(), 'qwen-image-3.0')
