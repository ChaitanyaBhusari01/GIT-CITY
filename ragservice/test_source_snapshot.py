import io
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RAG_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(RAG_ROOT))

from app.source_snapshot import _archive_relative_path, download_repository_source


COMMIT_SHA = "a" * 40


def _write_member(archive, name, body):
    payload = body.encode("utf-8")
    member = tarfile.TarInfo(name)
    member.size = len(payload)
    archive.addfile(member, io.BytesIO(payload))


def _fake_download(_url, archive_path):
    with tarfile.open(archive_path, "w:gz") as archive:
        root = tarfile.TarInfo("example-repo-commit/")
        root.type = tarfile.DIRTYPE
        archive.addfile(root)
        _write_member(
            archive,
            "example-repo-commit/src/app.js",
            "function safe() { return true; }",
        )
        _write_member(
            archive,
            "example-repo-commit/node_modules/pkg/index.js",
            "should not be copied",
        )
        _write_member(
            archive,
            "example-repo-commit/README.md",
            "documentation should not be copied as source",
        )
        _write_member(
            archive,
            "example-repo-commit/../escape.js",
            "outside repository",
        )
    return archive_path.stat().st_size


class SourceSnapshotTests(unittest.TestCase):
    def test_archive_paths_reject_traversal_and_absolute_paths(self):
        self.assertIsNone(_archive_relative_path("repo/../outside.js", "repo"))
        self.assertIsNone(_archive_relative_path("/etc/passwd", None))
        self.assertEqual(
            _archive_relative_path("repo/src/app.js", "repo").as_posix(),
            "src/app.js",
        )

    def test_snapshot_copies_only_supported_source_inside_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "app.source_snapshot._download_archive",
                side_effect=_fake_download,
            ):
                source_root = download_repository_source(
                    "example/repo",
                    COMMIT_SHA,
                    temp_dir,
                )

            self.assertEqual(
                (source_root / "src" / "app.js").read_text(encoding="utf-8"),
                "function safe() { return true; }",
            )
            self.assertFalse((source_root / "node_modules").exists())
            self.assertFalse((source_root / "README.md").exists())
            self.assertFalse((Path(temp_dir) / "escape.js").exists())
            self.assertFalse((Path(temp_dir) / "repository-source.tar.gz").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
