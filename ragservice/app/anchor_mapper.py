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




def find_anchor_context(node, line, language, parent_symbol=None):
    profile = LANGUAGE_PROFILES[language]
    symbol_types = profile["symbol_nodes"]
    construct_types = profile["construct_nodes"]

    if not (node.start_point.row + 1 <= line <= node.end_point.row + 1):
        return None

    current_symbol = node if node.type in symbol_types else parent_symbol
    for child in node.named_children:
        result = find_anchor_context(child, line, language, current_symbol)
        if result is not None:
            return result

    if node.type in construct_types:
        return {
            "construct": node,
            "symbol": current_symbol,
        }

    if node.type in symbol_types:
        return {
            "construct": node,
            "symbol": current_symbol,
        }
    return None
    