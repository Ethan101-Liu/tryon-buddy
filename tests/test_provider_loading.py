import os
from types import ModuleType
import unittest
from unittest.mock import patch

import model_provider


class ProviderLoadingTests(unittest.TestCase):
    def test_default_provider_remains_compatible(self):
        with patch.dict(os.environ, {'TRYON_PROVIDER_MODULE': ''}):
            self.assertEqual(model_provider.load_provider().__name__, 'aliyun_services')

    def test_custom_module_selected(self):
        provider = ModuleType('custom_test_provider')
        for name in model_provider.REQUIRED_FUNCTIONS:
            setattr(provider, name, lambda: None)
        provider.CloudError = type('CloudError', (Exception,), {})
        with patch.dict(os.environ, {'TRYON_PROVIDER_MODULE': provider.__name__}), \
             patch.dict('sys.modules', {provider.__name__: provider}):
            self.assertIs(model_provider.load_provider(), provider)

    def test_missing_contract_fails_at_startup(self):
        provider = ModuleType('incomplete_test_provider')
        with patch.dict(os.environ, {'TRYON_PROVIDER_MODULE': provider.__name__}), \
             patch.dict('sys.modules', {provider.__name__: provider}):
            with self.assertRaisesRegex(RuntimeError, 'CloudError'):
                model_provider.load_provider()

    def test_unavailable_module_has_actionable_message(self):
        with patch.dict(os.environ, {'TRYON_PROVIDER_MODULE': 'missing_tryon_provider_xyz'}):
            with self.assertRaisesRegex(RuntimeError, '检查模块路径及其依赖'):
                model_provider.load_provider()
