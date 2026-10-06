from app.file_filter import classify_file
from app.parser import parse_code


def process_file(file_path: str, code: str):
    """
    Classify a repository file and process it
    according to its category.
    """

    classification = classify_file(file_path)

    # Ignore files that should not enter the RAG pipeline
    if classification["action"] == "ignore":
        return {
            "path": file_path,
            "action": "ignore",
            "classification": classification,
        }

    # Parse source-code files with Tree-sitter
    if classification["action"] == "parse":
        tree = parse_code(
            code,
            classification["language"]
        )

        return {
            "path": file_path,
            "action": "parse",
            "language": classification["language"],
            "tree": tree,
        }

    # We will implement these later
    if classification["action"] == "document":
        return {
            "path": file_path,
            "action": "document",
            "classification": classification,
        }

    if classification["action"] in {"metadata", "dependency"}:
        return {
            "path": file_path,
            "action": classification["action"],
            "classification": classification,
        }

    return {
        "path": file_path,
        "action": "ignore",
        "classification": classification,
    }