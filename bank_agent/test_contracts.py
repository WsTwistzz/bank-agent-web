import unittest

from bank_agent.contracts import (
    PROTOCOL_VERSION,
    TOOL_CAPABILITIES_V1,
    TOOL_ERROR_CODES,
    TOOLS_PENDING_B_IMPLEMENTATION,
    ToolExecutionContext,
)
from tools.registry import ReadTool, ToolRegistry, create_banking_tool_registry


class ContextAwareTools:
    def get_value(self, user_id, key):
        return {
            "success": True,
            "data": {"user_id": user_id, "key": key},
            "error": None,
        }


class AgentToolContractTest(unittest.TestCase):
    def setUp(self):
        tools = ContextAwareTools()
        self.registry = ToolRegistry([
            ReadTool(
                tools, "get_value", "读取测试值", "get_value",
                properties={"key": {"type": "string"}}, required=["key"],
                domain="account", capability="account.test.read",
                tags=frozenset({"account", "read"}),
                allowed_specialists=frozenset({"account"}),
            ),
        ])

    def test_context_call_is_the_canonical_registry_interface(self):
        context = ToolExecutionContext(
            user_id="U1", session_id="S1", request_id="REQ1",
            turn_id="TURN1", graph="account", node="load",
            specialist="account",
        )

        result = self.registry.call(
            "get_value", {"key": "balance"}, context=context,
        )

        self.assertTrue(result["success"])
        self.assertEqual("U1", result["data"]["user_id"])
        self.assertEqual(PROTOCOL_VERSION, context.protocol_version)

    def test_context_policy_is_enforced_at_execution_time(self):
        context = ToolExecutionContext(
            user_id="U1", session_id="S1", request_id="REQ1",
            graph="payment", node="load", specialist="payment",
        )

        result = self.registry.call("get_value", {"key": "balance"}, context=context)

        self.assertFalse(result["success"])
        self.assertIn("not allowed for specialist", result["error"])

    def test_frozen_error_code_inventory_has_no_duplicates(self):
        self.assertIn("UNAUTHORIZED_TOOL", TOOL_ERROR_CODES)
        self.assertIn("INSUFFICIENT_FUNDS", TOOL_ERROR_CODES)
        self.assertEqual(12, len(TOOL_ERROR_CODES))

    def test_tool_manifests_match_frozen_v1_capabilities(self):
        registry = create_banking_tool_registry(object())
        actual = {
            item["name"]: (item["capability"], item["domain"], item["access"])
            for item in registry.metadata()
        }

        expected_now = {
            name: contract for name, contract in TOOL_CAPABILITIES_V1.items()
            if name not in TOOLS_PENDING_B_IMPLEMENTATION
        }
        self.assertEqual(expected_now, actual)

    def test_v1_explicitly_tracks_tools_assigned_to_b(self):
        self.assertEqual({"evaluate_transfer_risk"}, TOOLS_PENDING_B_IMPLEMENTATION)
        self.assertEqual(
            ("risk.transfer.evaluate", "risk", "read"),
            TOOL_CAPABILITIES_V1["evaluate_transfer_risk"],
        )


if __name__ == "__main__":
    unittest.main()
