import re

NODE_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
REF_PATTERN = re.compile(
    r"^(?P<node>[A-Za-z][A-Za-z0-9_-]{0,63})\.output"
    r"(?:\.[A-Za-z_][A-Za-z0-9_-]*|\.\d+|\[\d+\])*$"
)
RUNTIME_FIELDS = {"user_id", "session_id", "request_id", "idempotency_key"}


class PlanValidationError(ValueError):
    pass


class PlanValidator:
    def __init__(self, registry, max_nodes=10, max_write_nodes=1):
        self.registry = registry
        self.max_nodes = max_nodes
        self.max_write_nodes = max_write_nodes

    def validate(self, plan, allowed_tools=None):
        if not isinstance(plan, dict):
            raise PlanValidationError("plan must be an object")
        if not isinstance(plan.get("goal"), str) or not plan["goal"].strip():
            raise PlanValidationError("plan goal is required")
        nodes = plan.get("nodes")
        if not isinstance(nodes, list):
            raise PlanValidationError("plan nodes must be an array")
        if len(nodes) > self.max_nodes:
            raise PlanValidationError(f"plan exceeds {self.max_nodes} nodes")

        allowed = set(self.registry.tools)
        if allowed_tools is not None:
            allowed &= set(allowed_tools)
        node_by_id = self._index_nodes(nodes)
        ancestors = self._validate_dependencies(node_by_id)

        write_nodes = 0
        for node in nodes:
            tool_name = node.get("tool")
            if tool_name not in allowed:
                raise PlanValidationError(f"tool is not allowed: {tool_name}")
            tool = self.registry.tools[tool_name]
            if tool.access == "write":
                write_nodes += 1
            self._validate_arguments(node, tool, ancestors[node["id"]])
        if write_nodes > self.max_write_nodes:
            raise PlanValidationError(
                f"plan contains more than {self.max_write_nodes} write node"
            )
        return plan

    @staticmethod
    def _index_nodes(nodes):
        result = {}
        for node in nodes:
            if not isinstance(node, dict):
                raise PlanValidationError("each plan node must be an object")
            node_id = node.get("id")
            if not isinstance(node_id, str) or not NODE_ID_PATTERN.fullmatch(node_id):
                raise PlanValidationError(f"invalid node id: {node_id}")
            if node_id in result:
                raise PlanValidationError(f"duplicate node id: {node_id}")
            if not isinstance(node.get("depends_on"), list):
                raise PlanValidationError(f"depends_on must be an array: {node_id}")
            result[node_id] = node
        return result

    @staticmethod
    def _validate_dependencies(node_by_id):
        visiting = set()
        visited = set()
        ancestors = {}

        def visit(node_id):
            if node_id in visiting:
                raise PlanValidationError("task plan contains a cycle")
            if node_id in visited:
                return ancestors[node_id]
            visiting.add(node_id)
            result = set()
            dependencies = node_by_id[node_id]["depends_on"]
            if len(dependencies) != len(set(dependencies)):
                raise PlanValidationError(f"duplicate dependency: {node_id}")
            for dependency in dependencies:
                if dependency not in node_by_id:
                    raise PlanValidationError(f"unknown dependency: {dependency}")
                if dependency == node_id:
                    raise PlanValidationError("task plan contains a cycle")
                result.add(dependency)
                result.update(visit(dependency))
            visiting.remove(node_id)
            visited.add(node_id)
            ancestors[node_id] = result
            return result

        for current in node_by_id:
            visit(current)
        return ancestors

    def _validate_arguments(self, node, tool, ancestors):
        arguments = node.get("arguments")
        if not isinstance(arguments, dict):
            raise PlanValidationError(f"arguments must be an object: {node['id']}")
        forbidden = RUNTIME_FIELDS & set(arguments)
        if forbidden:
            raise PlanValidationError(
                "runtime identity cannot appear in plan arguments: "
                + ", ".join(sorted(forbidden))
            )
        missing = set(tool.required) - set(arguments)
        if missing:
            raise PlanValidationError(
                f"missing fields for {node['id']}: " + ", ".join(sorted(missing))
            )
        unknown = set(arguments) - set(tool.properties)
        if unknown:
            raise PlanValidationError(
                f"unknown fields for {node['id']}: " + ", ".join(sorted(unknown))
            )
        for name, value in arguments.items():
            reference = self._reference_node(value)
            if reference:
                if reference not in ancestors:
                    raise PlanValidationError(
                        f"{node['id']}.{name} references a non-dependency node: {reference}"
                    )
                continue
            self._validate_literal(node["id"], name, value, tool.properties[name])

    @staticmethod
    def _reference_node(value):
        if not isinstance(value, dict):
            return None
        if set(value) != {"$ref"} or not isinstance(value["$ref"], str):
            raise PlanValidationError("argument objects must be a single valid $ref")
        match = REF_PATTERN.fullmatch(value["$ref"])
        if not match:
            raise PlanValidationError(f"invalid reference: {value['$ref']}")
        return match.group("node")

    @staticmethod
    def _validate_literal(node_id, name, value, schema):
        expected = {
            "string": str,
            "integer": int,
            "number": (int, float),
        }.get(schema.get("type"))
        if expected and (not isinstance(value, expected) or isinstance(value, bool)):
            raise PlanValidationError(f"{node_id}.{name} has invalid type")
        if "minimum" in schema and value < schema["minimum"]:
            raise PlanValidationError(f"{node_id}.{name} is below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise PlanValidationError(f"{node_id}.{name} is above maximum")
