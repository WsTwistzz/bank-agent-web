import os
import unittest
from unittest.mock import patch

from bank_agent.config import AgentConfig, model_configs_from_env


class AgentConfigTest(unittest.TestCase):
    def test_defaults_to_standard_mode(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(AgentConfig.from_env().mode, "standard")

    def test_rejects_unknown_mode(self):
        with patch.dict(os.environ, {"AGENT_MODE": "autonomous"}, clear=True):
            with self.assertRaisesRegex(ValueError, "standard or expert"):
                AgentConfig.from_env()

    def test_role_model_overrides_default(self):
        environment = {
            "LLM_API_KEY": "secret",
            "LLM_MODEL": "deepseek-v4-pro",
            "LLM_SUPERVISOR_MODEL": "deepseek-v4-flash",
        }
        with patch.dict(os.environ, environment, clear=True):
            configs = model_configs_from_env()
        self.assertEqual(configs["supervisor"].model, "deepseek-v4-flash")
        self.assertEqual(configs["account"].model, "deepseek-v4-pro")


if __name__ == "__main__":
    unittest.main()
