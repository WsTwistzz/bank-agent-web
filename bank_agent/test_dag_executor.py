import threading
import time
import unittest

from bank_agent.dag_executor import DagExecutor, ExecutionPolicy
from bank_agent.reference_resolver import ReferenceResolutionError, resolve_reference
from tools.registry import ActionTool, ReadTool, ToolRegistry


class FakeTools:
    def __init__(self):
        self.calls = []
        self.barrier = None
        self.failures = 0
        self.write_waits = False
        self.stage_counts = {}

    def source(self, user_id):
        self.calls.append(("source", user_id))
        return {"success": True, "data": {"accounts": [{"id": "A1"}]}, "error": None}

    def consume(self, user_id, account_id):
        self.calls.append(("consume", user_id, account_id))
        return {"success": True, "data": {"account_id": account_id}, "error": None}

    def parallel(self, user_id, name):
        self.calls.append(("parallel", name, threading.get_ident()))
        self.barrier.wait(timeout=2)
        return {"success": True, "data": name, "error": None}

    def stage(self, user_id, name):
        count = self.stage_counts.get(name, 0) + 1
        self.stage_counts[name] = count
        self.calls.append(("stage", name, count, threading.get_ident()))
        if count == 1:
            self.barrier.wait(timeout=2)
        if name == "products" and count == 1:
            return {"success": False, "data": None, "error": "temporary"}
        data = {"accounts": [{"id": "A1"}]} if name == "accounts" else ["稳健理财"]
        return {"success": True, "data": data, "error": None}

    def flaky(self, user_id):
        self.failures += 1
        if self.failures == 1:
            return {"success": False, "data": None, "error": "temporary"}
        return {"success": True, "data": "recovered", "error": None}

    def fail(self, user_id):
        self.calls.append(("fail", user_id))
        return {"success": False, "data": None, "error": "bank unavailable"}

    def slow(self, user_id):
        time.sleep(0.1)
        return {"success": True, "data": "late", "error": None}

    def write(self, user_id, session_id, target, idempotency_key=None):
        self.calls.append(("write", target, idempotency_key))
        if self.write_waits:
            return {
                "success": True,
                "data": {"status": "WAITING_CONFIRMATION", "action_id": "ACT1"},
                "error": None,
            }
        return {"success": False, "data": None, "error": "write failed"}


def build_registry(tools):
    string = {"type": "string"}
    return ToolRegistry([
        ReadTool(tools, "source", "source", "source"),
        ReadTool(
            tools, "consume", "consume", "consume",
            properties={"account_id": string}, required=["account_id"],
        ),
        ReadTool(
            tools, "parallel", "parallel", "parallel",
            properties={"name": string}, required=["name"],
        ),
        ReadTool(
            tools, "stage", "stage", "stage",
            properties={"name": string}, required=["name"],
        ),
        ReadTool(tools, "flaky", "flaky", "flaky"),
        ReadTool(tools, "fail", "fail", "fail"),
        ReadTool(tools, "slow", "slow", "slow"),
        ActionTool(
            tools, "write", "write", "write",
            properties={"target": string}, required=["target"],
        ),
    ])


def task_plan(nodes):
    return {"goal": "test", "nodes": [{
        **node, "status": "PENDING", "attempts": 0,
    } for node in nodes], "status": "ACTIVE", "version": 1}


class ReferenceResolverTest(unittest.TestCase):
    def test_resolves_mixed_object_and_array_path(self):
        outputs = {"load": {"accounts": [{"id": "A1"}]}}
        self.assertEqual(
            "A1", resolve_reference("load.output.accounts[0].id", outputs)
        )

    def test_rejects_missing_path(self):
        with self.assertRaisesRegex(ReferenceResolutionError, "does not exist"):
            resolve_reference("load.output.accounts[1].id", {"load": {"accounts": []}})


class DagExecutorTest(unittest.TestCase):
    def setUp(self):
        self.tools = FakeTools()
        self.registry = build_registry(self.tools)

    def execute(self, plan, policy=None):
        return DagExecutor(self.registry, policy=policy).execute(
            plan, "U1", "S1", "REQ1", "account"
        )

    def test_executes_dependencies_and_resolves_output_reference(self):
        plan = task_plan([
            {"id": "load", "tool": "source", "arguments": {}, "depends_on": []},
            {
                "id": "use", "tool": "consume",
                "arguments": {"account_id": {"$ref": "load.output.accounts[0].id"}},
                "depends_on": ["load"],
            },
        ])
        result = self.execute(plan)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(result["nodes"][1]["resolved_arguments"], {"account_id": "A1"})
        self.assertEqual(self.tools.calls, [("source", "U1"), ("consume", "U1", "A1")])

    def test_stage_two_acceptance_case(self):
        self.tools.barrier = threading.Barrier(2)
        plan = task_plan([
            {
                "id": "load_accounts", "tool": "stage",
                "arguments": {"name": "accounts"}, "depends_on": [],
            },
            {
                "id": "load_products", "tool": "stage",
                "arguments": {"name": "products"}, "depends_on": [],
            },
            {
                "id": "inspect_account", "tool": "consume",
                "arguments": {
                    "account_id": {"$ref": "load_accounts.output.accounts[0].id"}
                },
                "depends_on": ["load_accounts"],
            },
        ])

        result = self.execute(plan)
        by_id = {node["id"]: node for node in result["nodes"]}
        first_attempt_threads = {
            item[3] for item in self.tools.calls
            if item[0] == "stage" and item[2] == 1
        }

        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(len(first_attempt_threads), 2)
        self.assertEqual(by_id["load_accounts"]["attempts"], 1)
        self.assertEqual(by_id["load_products"]["attempts"], 2)
        self.assertEqual(by_id["inspect_account"]["status"], "SUCCEEDED")
        self.assertEqual(
            by_id["inspect_account"]["resolved_arguments"], {"account_id": "A1"}
        )
        self.assertEqual(self.tools.calls[-1], ("consume", "U1", "A1"))

    def test_runs_same_layer_reads_in_parallel(self):
        self.tools.barrier = threading.Barrier(2)
        plan = task_plan([
            {"id": "one", "tool": "parallel", "arguments": {"name": "one"}, "depends_on": []},
            {"id": "two", "tool": "parallel", "arguments": {"name": "two"}, "depends_on": []},
        ])
        result = self.execute(plan)
        thread_ids = {item[2] for item in self.tools.calls}
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(len(thread_ids), 2)

    def test_retries_reads_but_never_writes(self):
        read = task_plan([
            {"id": "read", "tool": "flaky", "arguments": {}, "depends_on": []},
        ])
        read_result = self.execute(read)
        self.assertEqual(read_result["nodes"][0]["attempts"], 2)
        self.assertEqual(read_result["nodes"][0]["status"], "SUCCEEDED")

        write = task_plan([
            {"id": "write", "tool": "write", "arguments": {"target": "A1"}, "depends_on": []},
        ])
        write_result = self.execute(write)
        self.assertEqual(write_result["nodes"][0]["attempts"], 1)
        self.assertEqual(len([item for item in self.tools.calls if item[0] == "write"]), 1)

    def test_skips_downstream_node_after_failure(self):
        plan = task_plan([
            {"id": "bad", "tool": "fail", "arguments": {}, "depends_on": []},
            {"id": "child", "tool": "consume", "arguments": {"account_id": "A1"}, "depends_on": ["bad"]},
        ])
        result = self.execute(plan)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(result["nodes"][0]["status"], "FAILED")
        self.assertEqual(result["nodes"][1]["status"], "SKIPPED")

    def test_marks_slow_read_as_timed_out(self):
        plan = task_plan([
            {"id": "slow", "tool": "slow", "arguments": {}, "depends_on": []},
            {"id": "child", "tool": "consume", "arguments": {"account_id": "A1"}, "depends_on": ["slow"]},
        ])
        policy = ExecutionPolicy(node_timeout_seconds=0.01, read_retries=0)
        result = self.execute(plan, policy)
        self.assertEqual(result["nodes"][0]["status"], "FAILED")
        self.assertIn("timed out", result["nodes"][0]["error"])
        self.assertEqual(result["nodes"][1]["status"], "SKIPPED")

    def test_stops_plan_in_waiting_state_after_action_creation(self):
        self.tools.write_waits = True
        plan = task_plan([
            {"id": "change", "tool": "write", "arguments": {"target": "A1"}, "depends_on": []},
            {"id": "after", "tool": "consume", "arguments": {"account_id": "A1"}, "depends_on": ["change"]},
        ])
        result = self.execute(plan)
        self.assertEqual(result["status"], "WAITING")
        self.assertEqual(result["nodes"][0]["status"], "WAITING")
        self.assertEqual(result["nodes"][1]["status"], "PENDING")


if __name__ == "__main__":
    unittest.main()
