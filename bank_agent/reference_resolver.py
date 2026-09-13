import re


PATH_TOKEN = re.compile(r"\.([A-Za-z_][A-Za-z0-9_-]*|\d+)|\[(\d+)\]")


class ReferenceResolutionError(ValueError):
    pass


def resolve_arguments(arguments, outputs):
    return {
        name: resolve_reference(value["$ref"], outputs)
        if isinstance(value, dict) and set(value) == {"$ref"}
        else value
        for name, value in arguments.items()
    }


def resolve_reference(reference, outputs):
    marker = ".output"
    if marker not in reference:
        raise ReferenceResolutionError(f"invalid reference: {reference}")
    node_id, path = reference.split(marker, 1)
    if node_id not in outputs:
        raise ReferenceResolutionError(f"output is unavailable: {node_id}")
    value = outputs[node_id]
    position = 0
    while position < len(path):
        match = PATH_TOKEN.match(path, position)
        if not match:
            raise ReferenceResolutionError(f"invalid reference path: {reference}")
        token = match.group(1) if match.group(1) is not None else match.group(2)
        try:
            if token.isdigit():
                value = value[int(token)]
            else:
                value = value[token]
        except (IndexError, KeyError, TypeError) as error:
            raise ReferenceResolutionError(
                f"reference path does not exist: {reference}"
            ) from error
        position = match.end()
    return value
