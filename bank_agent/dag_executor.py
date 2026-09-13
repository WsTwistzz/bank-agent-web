import copy
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass

from bank_agent.reference_resolver import (
    ReferenceResolutionError,
    resolve_arguments,
)


@dataclass(frozen=True)
class ExecutionPolicy:
    max_parallel_reads: int = 3
    read_retries: int = 1
    node_timeout_seconds: float = 30.0

    def __post_init__(self):
        if self.max_parallel_reads < 1:
            raise ValueError("max_parallel_reads must be positive")
        if self.read_retries < 0:
            raise ValueError("read_retries cannot be negative")
        if self.node_timeout_seconds <= 0:
            raise ValueError("node_timeout_seconds must be positive")


class DagExecutor:
    def __init__(self, registry, policy=None, trace=None):
        self.registry = registry
        self.policy = policy or ExecutionPolicy()
        self.trace = trace

    def execute(self, plan, user_id, session_id, request_id, specialist):
        executed = copy.deepcopy(plan)
        nodes = {node["id"]: node for node in executed["nodes"]}
        outputs = {}

        while True:
            if any(node["status"] == "WAITING" for node in nodes.values()):
                break
            pending = [node for node in nodes.values() if node["status"] == "PENDING"]
            if not pending:
                break

            for node in pending:
                dependencies = [nodes[item] for item in node["depends_on"]]
                if any(item["status"] in {"FAILED", "SKIPPED"} for item in dependencies):
                    node["status"] = "SKIPPED"
                    node["error"] = "dependency failed"
                    self._trace_node("dag_node_skipped", node, user_id, session_id, specialist)

            ready = [
                node for node in nodes.values()
                if node["status"] == "PENDING"
                and all(nodes[item]["status"] == "SUCCEEDED" for item in node["depends_on"])
            ]
            if not ready:
                if any(node["status"] == "PENDING" for node in nodes.values()):
                    for node in nodes.values():
                        if node["status"] == "PENDING":
                            node["status"] = "FAILED"
                            node["error"] = "scheduler made no progress"
                break

            reads = [node for node in ready if not self.registry.is_write(node["tool"])]
            writes = [node for node in ready if self.registry.is_write(node["tool"])]
            for node in ready:
                node["status"] = "RUNNING"
                self._trace_node(
                    "dag_node_started", node, user_id, session_id, specialist
                )
            if reads:
                self._execute_read_batch(
                    reads, outputs, user_id, session_id, request_id, specialist
                )
            for node in writes:
                outcome = self._run_node(
                    node, outputs, user_id, session_id, request_id,
                    specialist, retries=0,
                )
                self._apply_outcome(node, outcome, outputs, user_id, session_id, specialist)

        waiting = any(node["status"] == "WAITING" for node in nodes.values())
        failed = any(node["status"] in {"FAILED", "SKIPPED"} for node in nodes.values())
        executed["status"] = "WAITING" if waiting else "FAILED" if failed else "SUCCEEDED"
        self._trace(
            "dag_completed", user_id, session_id,
            specialist=specialist, status=executed["status"], plan=executed,
        )
        return executed

    def _execute_read_batch(
        self, nodes, outputs, user_id, session_id, request_id, specialist,
    ):
        pool = ThreadPoolExecutor(
            max_workers=min(self.policy.max_parallel_reads, len(nodes)),
            thread_name_prefix="bank-read",
        )
        futures = {
            pool.submit(
                self._run_node, node, outputs, user_id, session_id,
                request_id, specialist, self.policy.read_retries,
            ): node
            for node in nodes
        }
        done, unfinished = wait(
            futures, timeout=self.policy.node_timeout_seconds
        )
        for future in done:
            node = futures[future]
            try:
                outcome = future.result()
            except Exception as error:
                outcome = {"success": False, "error": str(error), "attempts": 1}
            self._apply_outcome(node, outcome, outputs, user_id, session_id, specialist)
        for future in unfinished:
            future.cancel()
            node = futures[future]
            node["status"] = "FAILED"
            node["error"] = f"node timed out after {self.policy.node_timeout_seconds:g}s"
            node["attempts"] = max(node.get("attempts", 0), 1)
            self._trace_node("dag_node_failed", node, user_id, session_id, specialist)
        pool.shutdown(wait=False, cancel_futures=True)

    def _run_node(
        self, node, outputs, user_id, session_id, request_id, specialist, retries,
    ):
        try:
            arguments = resolve_arguments(node["arguments"], outputs)
        except ReferenceResolutionError as error:
            return {"success": False, "error": str(error), "attempts": 0}
        result = None
        for attempt in range(1, retries + 2):
            result = self.registry.call(
                node["tool"], arguments, user_id, session_id,
                request_id=request_id,
            )
            self._trace(
                "tool_call", user_id, session_id,
                specialist=specialist, node_id=node["id"],
                tool=node["tool"], arguments=arguments,
                attempt=attempt, result=result,
            )
            if result["success"]:
                return {
                    "success": True,
                    "output": result["data"],
                    "waiting": (
                        isinstance(result["data"], dict)
                        and result["data"].get("status")
                        in {"WAITING_CONFIRMATION", "WAITING_STRONG_AUTH"}
                    ),
                    "arguments": arguments,
                    "attempts": attempt,
                }
        return {
            "success": False,
            "error": result["error"] if result else "tool did not return a result",
            "arguments": arguments,
            "attempts": retries + 1,
        }

    def _apply_outcome(
        self, node, outcome, outputs, user_id, session_id, specialist,
    ):
        node["attempts"] = outcome["attempts"]
        if "arguments" in outcome:
            node["resolved_arguments"] = outcome["arguments"]
        if outcome["success"]:
            node["status"] = "WAITING" if outcome.get("waiting") else "SUCCEEDED"
            node["output"] = outcome["output"]
            outputs[node["id"]] = outcome["output"]
            event = "dag_node_waiting" if outcome.get("waiting") else "dag_node_succeeded"
        else:
            node["status"] = "FAILED"
            node["error"] = outcome["error"]
            event = "dag_node_failed"
        self._trace_node(event, node, user_id, session_id, specialist)

    def _trace_node(self, event, node, user_id, session_id, specialist):
        self._trace(
            event, user_id, session_id, specialist=specialist,
            node_id=node["id"], tool=node["tool"], status=node["status"],
            attempts=node.get("attempts", 0), error=node.get("error"),
        )

    def _trace(self, event, user_id, session_id, **details):
        if self.trace:
            self.trace.write(event, user_id, session_id, **details)
