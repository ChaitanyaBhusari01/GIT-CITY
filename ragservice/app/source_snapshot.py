"""Fetch the exact public GitHub revision needed for security finding context.

Only supported source files are copied from the untrusted archive. Archive
paths are validated, links are never followed, and both compressed and
extracted sizes are bounded.
"""

from __future__ import annotations

import re
import tarfile
from itertools import chain
from pathlib import Path, PurePosixPath
from typing import BinaryIO

import requests

from app.file_filter import classify_file


MAX_COMPRESSED_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_EXTRACTED_SOURCE_BYTES = 250 * 1024 * 1024
MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024
MAX_SOURCE_FILES = 20_000
MAX_ARCHIVE_ENTRIES = 100_000
DOWNLOAD_CHUNK_BYTES = 128 * 1024
GITHUB_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-fA-F]{40,64}$")


def _validated_repository(repository_id: str, commit_sha: str) -> tuple[str, str, str]:
    parts = repository_id.split("/") if isinstance(repository_id, str) else []
    if (
        len(parts) != 2
        or not all(GITHUB_NAME_PATTERN.fullmatch(part) for part in parts)
    ):
        raise ValueError("repository_id must be in owner/repository format.")
    if not isinstance(commit_sha, str) or not COMMIT_PATTERN.fullmatch(commit_sha):
        raise ValueError("commit_sha must be a full Git commit SHA.")

    owner, repository = parts
    return owner, repository, commit_sha.lower()


def _download_archive(url: str, archive_path: Path) -> int:
    """Download with a hard compressed-size limit and a bounded timeout."""
    total_bytes = 0

    with requests.get(
        url,
        headers={"User-Agent": "GitCity-Security-Analysis"},
        stream=True,
        allow_redirects=True,
        timeout=(10, 90),
    ) as response:
        if response.status_code != 200:
            raise RuntimeError(
                f"GitHub source archive download failed (HTTP {response.status_code})."
            )

        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                announced_size = int(content_length)
            except ValueError:
                announced_size = 0
            if announced_size > MAX_COMPRESSED_ARCHIVE_BYTES:
                raise RuntimeError("Repository source archive exceeds the download size limit.")

        with archive_path.open("wb") as destination:
            for chunk in response.iter_content(chunk_size=DOWNLOAD_CHUNK_BYTES):
                if not chunk:
                    continue
                total_bytes += len(chunk)
                if total_bytes > MAX_COMPRESSED_ARCHIVE_BYTES:
                    raise RuntimeError("Repository source archive exceeds the download size limit.")
                destination.write(chunk)

    if total_bytes == 0:
        raise RuntimeError("GitHub returned an empty source archive.")
    return total_bytes


def _archive_relative_path(
    member_name: str,
    archive_prefix: str | None,
) -> PurePosixPath | None:
    """Validate a tar path and remove the single wrapper directory used by GitHub."""
    normalized = member_name.replace("\\", "/")
    raw_path = PurePosixPath(normalized)

    if raw_path.is_absolute() or any(part in {"", ".", ".."} for part in raw_path.parts):
        return None

    parts = list(raw_path.parts)
    if archive_prefix and parts and parts[0] == archive_prefix:
        parts = parts[1:]

    if not parts:
        return None

    relative = PurePosixPath(*parts)
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        return None
    return relative


def _copy_member(source: BinaryIO, destination: Path, expected_size: int) -> None:
    remaining = expected_size
    with destination.open("xb") as output:
        while remaining:
            chunk = source.read(min(DOWNLOAD_CHUNK_BYTES, remaining))
            if not chunk:
                raise RuntimeError("Repository source archive ended unexpectedly.")
            output.write(chunk)
            remaining -= len(chunk)


def download_repository_source(
    repository_id: str,
    commit_sha: str,
    destination: str | Path,
) -> Path:
    """Download supported source files from exactly one public GitHub commit.

    The returned directory can be read by the existing Tree-sitter context
    enrichment and indexing modules. It does not contain a Git checkout.
    """
    owner, repository, commit = _validated_repository(repository_id, commit_sha)
    destination_root = Path(destination).expanduser().resolve()
    destination_root.mkdir(parents=True, exist_ok=True)
    source_root = destination_root / "source"
    source_root.mkdir(parents=True, exist_ok=True)
    archive_path = destination_root / "repository-source.tar.gz"

    url = f"https://codeload.github.com/{owner}/{repository}/tar.gz/{commit}"
    _download_archive(url, archive_path)

    extracted_bytes = 0
    extracted_files = 0
    entry_count = 0

    try:
        with tarfile.open(archive_path, mode="r:gz") as archive:
            first_member = archive.next()
            if first_member is None:
                raise RuntimeError("GitHub returned an empty source archive.")

            first_parts = PurePosixPath(first_member.name.replace("\\", "/")).parts
            archive_prefix = (
                first_parts[0]
                if first_member.isdir() and len(first_parts) == 1
                else None
            )

            for member in chain((first_member,), archive):
                entry_count += 1
                if entry_count > MAX_ARCHIVE_ENTRIES:
                    raise RuntimeError("Repository source archive contains too many entries.")

                # Filesystem links and non-regular entries are not needed for
                # source analysis and are deliberately not extracted.
                if not member.isfile() or member.issym() or member.islnk():
                    continue
                if member.size < 0 or member.size > MAX_SOURCE_FILE_BYTES:
                    continue

                relative = _archive_relative_path(member.name, archive_prefix)
                if relative is None:
                    continue

                relative_text = relative.as_posix()
                if classify_file(relative_text).get("action") != "parse":
                    continue

                if extracted_files >= MAX_SOURCE_FILES:
                    raise RuntimeError("Repository contains more supported source files than the analysis limit.")
                extracted_bytes += member.size
                if extracted_bytes > MAX_EXTRACTED_SOURCE_BYTES:
                    raise RuntimeError("Extracted source exceeds the analysis size limit.")

                output_path = (source_root / Path(*relative.parts)).resolve()
                try:
                    output_path.relative_to(source_root)
                except ValueError:
                    # Defense in depth in addition to the POSIX path check.
                    continue

                output_path.parent.mkdir(parents=True, exist_ok=True)
                file_stream = archive.extractfile(member)
                if file_stream is None:
                    continue

                with file_stream:
                    try:
                        _copy_member(file_stream, output_path, member.size)
                    except FileExistsError:
                        # Duplicate archive paths do not overwrite an earlier file.
                        continue

                extracted_files += 1
    except (tarfile.TarError, OSError) as exc:
        raise RuntimeError("Could not safely unpack the GitHub source archive.") from exc
    finally:
        archive_path.unlink(missing_ok=True)

    if extracted_files == 0:
        raise RuntimeError("No supported source files were found in the repository snapshot.")

    return source_root
