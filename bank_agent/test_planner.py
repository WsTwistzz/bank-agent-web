import unittest

from bank_agent.planner import Planner, PlanningError
from bank_agent.plan_validator import PlanValidationError, PlanValidator
from tools.registry import ActionTool, ReadTool, ToolRegistry


class DummyBankingTools:
    def read(self, **kwargs):
        return kwargs

    def write(self, **kwargs):
        return kwargs


def build_registry():
    banking = DummyBankingTools()
    return ToolRegistry([
        ReadTool(
            banking_tools=banking,
            name="lookup",
            description="lookup",
            method="read",
            properties={"query": {"type": "string"}},
            required=["query"],
        ),
        ActionTool(
            banking_tools=banking,
            name="submit",
            description="submit",
            method="write",
            properties={"target": {"type": "string"}},
            required=["target"],
        ),
    ])


def plan(nodes):
    return {
        "goal": "test goal",
        "nodes": nodes,
        "status": "ACTIVE",
        "version": 1,
    }


class FakePlanningModel:
    def __init__(self, reply):
        self.reply = reply
        self.messages = None
        self.tools = None

    def respond(self, messages, tools):
        self.messages = messages
        self.tools = tools
        return self.reply


class PlannerTest(unittest.TestCase):
    def test_creates_normalized_plan(self):
        model = FakePlanningModel({"content": "", "tool_calls": [{
            "id": "p1",
            "name": "submit_task_plan",
            "arguments": {
                "goal": "find target",
                "nodes": [{
                    "id": "find",
                    "tool": "lookup",
                    "arguments": {"query": "alice"},
                    "depends_on": [],
                }],
            },
        }]})
        result = Planner(model, build_registry()).create("find alice", {"lookup"})
        self.assertEqual(result["nodes"][0]["status"], "PENDING")
        self.assertEqual(result["nodes"][0]["attempts"], 0)
        self.assertEqual(result["status"], "ACTIVE")
        self.assertIn("lookup", model.messages[0]["content"])

    def test_rejects_non_tool_response(self):
        model = FakePlanningModel({"content": "no plan", "tool_calls": []})
        with self.assertRaises(PlanningError):
            Planner(model, build_registry()).create("test")


class PlanValidatorTest(unittest.TestCase):
    def setUp(self):
        self.validator = PlanValidator(build_registry())

    def test_accepts_dependency_output_reference(self):
        value = plan([
            {
                "id": "find",
                "tool": "lookup",
                "arguments": {"query": "alice"},
                "depends_on": [],
            },
            {
                "id": "send",
                "tool": "submit",
                "arguments": {"target": {"$ref": "find.output.0.id"}},
                "depends_on": ["find"],
            },
        ])
        self.assertIs(self.validator.validate(value), value)

    def test_accepts_bracket_array_reference(self):
        value = plan([
            {
                "id": "node_1",
                "tool": "lookup",
                "arguments": {"query": "accounts"},
                "depends_on": [],
            },
            {
                "id": "node_2",
                "tool": "submit",
                "arguments": {
                    "target": {
                        "$ref": "node_1.output.accounts[0].account_id"
                    }
                },
                "depends_on": ["node_1"],
            },
        ])
        self.assertIs(self.validator.validate(value), value)

    def test_rejects_cycle(self):
        value = plan([
            {"id": "a", "tool": "lookup", "arguments": {"query": "a"}, "depends_on": ["b"]},
            {"id": "b", "tool": "lookup", "arguments": {"query": "b"}, "depends_on": ["a"]},
        ])
        with self.assertRaisesRegex(PlanValidationError, "cycle"):
            self.validator.validate(value)

    def test_rejects_tool_outside_specialist_allowlist(self):
        value = plan([{
            "id": "send", "tool": "submit",
            "arguments": {"target": "A1"}, "depends_on": [],
        }])
        with self.assertRaisesRegex(PlanValidationError, "not allowed"):
            self.validator.validate(value, {"lookup"})

    def test_rejects_runtime_identity(self):
        value = plan([{
            "id": "find", "tool": "lookup",
            "arguments": {"query": "alice", "user_id": "U2"}, "depends_on": [],
        }])
        with self.assertRaisesRegex(PlanValidationError, "runtime identity"):
            self.validator.validate(value)

    def test_rejects_reference_to_non_dependency(self):
        value = plan([
            {"id": "find", "tool": "lookup", "arguments": {"query": "a"}, "depends_on": []},
            {
                "id": "send", "tool": "submit",
                "arguments": {"target": {"$ref": "find.output.0.id"}}, "depends_on": [],
            },
        ])
        with self.assertRaisesRegex(PlanValidationError, "non-dependency"):
            self.validator.validate(value)

    def test_rejects_more_than_one_write_node(self):
        value = plan([
            {"id": "one", "tool": "submit", "arguments": {"target": "A1"}, "depends_on": []},
            {"id": "two", "tool": "submit", "arguments": {"target": "A2"}, "depends_on": []},
        ])
        with self.assertRaisesRegex(PlanValidationError, "more than 1 write"):
            self.validator.validate(value)


if __name__ == "__main__":
    unittest.main()
