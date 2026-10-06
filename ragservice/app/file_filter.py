from pathlib import Path


IGNORED_DIRECTORIES = {
    ".git",
    ".github",         #workflows will be handled later
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".cache",
    ".idea",
}



METADATA_FILES = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "pom.xml",
    "go.mod",
    "Cargo.toml",
}


LOCK_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "Pipfile.lock",
    "Cargo.lock",
}


DOCUMENT_EXTENSIONS = {
    ".md",
    ".mdx",
    ".rst",
    ".txt",
}


SOURCE_EXTENSIONS = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".py": "python",
    ".java": "java",
    ".go": "go",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".cs": "c_sharp",
    ".rs": "rust",
    ".php": "php",
    ".rb": "ruby",
    ".kt": "kotlin",
    ".swift": "swift",
}


def classify_file(file_path: str) -> dict:
    """
    Decide how a repository file should enter the RAG pipeline.

    Returns:
        {
            "action": "parse" | "document" | "metadata" | "dependency" | "ignore",
            "category": str,
            "language": str | None,
            "reason": str
        }
    """

    path = Path(file_path)
    name = path.name
    suffix = path.suffix.lower()

    # ---------------------------------------------------------
    # 1. Ignore files inside known dependency/build/cache dirs
    # ---------------------------------------------------------

    if any(part in IGNORED_DIRECTORIES for part in path.parts):
        return {
            "action": "ignore",
            "category": "ignored_directory",
            "language": None,
            "reason": f"File is inside an ignored directory."
        }

    # ---------------------------------------------------------
    # 2. Dependency manifests
    # ---------------------------------------------------------

    if name in METADATA_FILES:
        return {
            "action": "metadata",
            "category": "dependency_manifest",
            "language": None,
            "reason": "Dependency/project manifest."
        }

    # ---------------------------------------------------------
    # 3. Lockfiles
    # ---------------------------------------------------------

    if name in LOCK_FILES:
        return {
            "action": "dependency",
            "category": "lockfile",
            "language": None,
            "reason": "Dependency lockfile."
        }

    # ---------------------------------------------------------
    # 4. Documentation
    # ---------------------------------------------------------

    if suffix in DOCUMENT_EXTENSIONS:
        return {
            "action": "document",
            "category": "documentation",
            "language": None,
            "reason": "Documentation file."
        }

    # ---------------------------------------------------------
    # 5. Source code
    # ---------------------------------------------------------

    if suffix in SOURCE_EXTENSIONS:
        return {
            "action": "parse",
            "category": "source_code",
            "language": SOURCE_EXTENSIONS[suffix],
            "reason": "Supported source-code file."
        }

    # ---------------------------------------------------------
    # 6. Everything else
    # ---------------------------------------------------------

    return {
        "action": "ignore",
        "category": "unsupported",
        "language": None,
        "reason": "Unsupported file type."
    }