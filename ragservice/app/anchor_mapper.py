from app.language_profiles import LANGUAGE_PROFILES


def find_chunk_for_line(chunks: list[dict], line: int) -> dict | None:
    matches = [
        chunk
        for chunk in chunks
        if chunk["start_line"] <= line <= chunk["end_line"]
    ]

    if not matches:
        return None

    return min(
        matches,
        key=lambda chunk: chunk["end_line"] - chunk["start_line"]
    )


def find_anchor_context(node, line, language, code, parent_symbol=None):
    profile = LANGUAGE_PROFILES[language]
    symbol_types = profile["symbol_nodes"]
    construct_types = profile["construct_nodes"]

    if not (node.start_point.row + 1 <= line <= node.end_point.row + 1):
        return None

    current_symbol = node if node.type in symbol_types else parent_symbol

    for child in node.named_children:
        result = find_anchor_context(
            child,
            line,
            language,
            code,
            current_symbol
        )

        if result is not None:
            return result

    if node.type in construct_types:
        return {
            "construct": node_to_info(node, code),
            "symbol": node_to_info(current_symbol, code),
        }

    if node.type in symbol_types:
        return {
            "construct": node_to_info(node, code),
            "symbol": node_to_info(current_symbol, code),
        }

    return None


def node_to_info(node, code):
    if node is None:
        return None

    name_node = node.child_by_field_name("name")

    return {
        "type": node.type,
        "code": code[node.start_byte:node.end_byte],
        "start_line": node.start_point.row + 1,
        "end_line": node.end_point.row + 1,
        "name": (
            code[name_node.start_byte:name_node.end_byte]
            if name_node
            else None
        )
    }

def extract_location_snippet(
    code: str,
    location: dict | None,
) -> str | None:
    """Extract the exact source region described by a SARIF location."""
    if not isinstance(code, str) or not isinstance(location, dict):
        return None

    start_line = location.get("start_line")
    end_line = location.get("end_line") or start_line

    if (
        not isinstance(start_line, int)
        or isinstance(start_line, bool)
        or start_line < 1
    ):
        return None

    if (
        not isinstance(end_line, int)
        or isinstance(end_line, bool)
        or end_line < start_line
    ):
        return None

    lines = code.splitlines()

    if start_line > len(lines) or end_line > len(lines):
        return None

    start_column = location.get("start_column")
    end_column = location.get("end_column")

    if start_column is not None and (
        not isinstance(start_column, int)
        or isinstance(start_column, bool)
        or start_column < 1
    ):
        return None

    if end_column is not None and (
        not isinstance(end_column, int)
        or isinstance(end_column, bool)
        or end_column < 1
    ):
        return None

    # SARIF columns are one-based; Python string indexes are zero-based.
    start_index = start_column - 1 if start_column is not None else 0

    first_line = lines[start_line - 1]

    if start_line == end_line:
        end_index = (
            end_column - 1
            if end_column is not None
            else len(first_line)
        )

        if end_index < start_index:
            return None

        return first_line[start_index:end_index]

    last_line = lines[end_line - 1]
    end_index = (
        end_column - 1
        if end_column is not None
        else len(last_line)
    )

    return "\n".join([
        first_line[start_index:],
        *lines[start_line:end_line - 1],
        last_line[:end_index],
    ])