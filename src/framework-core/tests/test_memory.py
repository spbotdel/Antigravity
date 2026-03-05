"""Unit tests for shared memory synchronization helpers."""

import sys
import tempfile
import unittest
from pathlib import Path


FRAMEWORK_CORE_ROOT = Path(__file__).resolve().parents[1]
if str(FRAMEWORK_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(FRAMEWORK_CORE_ROOT))

from tasks.memory import (  # noqa: E402
    _build_architecture_auto_block,
    _build_backlog_auto_block,
    _build_latest_session_block,
    _build_snapshot_auto_block,
    _upsert_marked_block,
)


class UpsertMarkedBlockTests(unittest.TestCase):
    def test_insert_marked_block_when_markers_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "SNAPSHOT.md"
            path.write_text("# Manual notes\n\nKeep this text.\n", encoding="utf-8")

            changed = _upsert_marked_block(path, "FRAMEWORK:AUTO", "Auto content v1")

            self.assertTrue(changed)
            content = path.read_text(encoding="utf-8")
            self.assertIn("# Manual notes", content)
            self.assertIn("Keep this text.", content)
            self.assertIn("<!-- FRAMEWORK:AUTO:START -->", content)
            self.assertIn("Auto content v1", content)
            self.assertIn("<!-- FRAMEWORK:AUTO:END -->", content)

    def test_update_only_block_content_when_markers_exist(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "BACKLOG.md"
            original = (
                "Header section\n\n"
                "<!-- FRAMEWORK:AUTO:START -->\n"
                "old content\n"
                "<!-- FRAMEWORK:AUTO:END -->\n\n"
                "Footer section\n"
            )
            path.write_text(original, encoding="utf-8")

            changed = _upsert_marked_block(path, "FRAMEWORK:AUTO", "new content")

            self.assertTrue(changed)
            content = path.read_text(encoding="utf-8")
            self.assertIn("Header section", content)
            self.assertIn("Footer section", content)
            self.assertIn("new content", content)
            self.assertNotIn("old content", content)


class BuildBlockTests(unittest.TestCase):
    def test_build_auto_blocks_are_deterministic(self):
        timestamp = "2026-03-05 10:30:00Z"
        branch = "feature/memory-sync"
        git_status = "STATUS:3 files"
        git_diff = "DIFF:42 lines"
        changed_paths = ["src/a.py", "src/b.py", "README.md"]
        stack = ["Node.js / npm", "Python"]
        structure = ["- `src/`", "- `tests/`", "- `README.md`"]

        snapshot_a = _build_snapshot_auto_block(
            timestamp,
            branch,
            git_status,
            git_diff,
            changed_paths,
            stack,
            structure,
        )
        snapshot_b = _build_snapshot_auto_block(
            timestamp,
            branch,
            git_status,
            git_diff,
            changed_paths,
            stack,
            structure,
        )
        self.assertEqual(snapshot_a, snapshot_b)
        self.assertIn("Active branch", snapshot_a)
        self.assertIn("Git status", snapshot_a)
        self.assertIn("Top-Level Structure Snapshot", snapshot_a)

        backlog = _build_backlog_auto_block(
            timestamp,
            branch,
            git_status,
            git_diff,
            changed_paths,
            stack,
            structure,
        )
        self.assertIn("Suggested Focus", backlog)
        self.assertIn("Detected Stack", backlog)
        self.assertIn("Top-Level Structure Snapshot", backlog)

        architecture = _build_architecture_auto_block(
            timestamp,
            branch,
            git_status,
            git_diff,
            stack,
            structure,
            changed_paths,
        )
        self.assertIn("Git diff", architecture)
        self.assertIn("Recently Changed Paths", architecture)

    def test_build_latest_session_block_handles_missing_tasks(self):
        session = _build_latest_session_block(
            timestamp_utc="2026-03-05 10:30:00Z",
            branch="main",
            git_status_result="STATUS:2 files",
            git_diff_result="DIFF:11 lines",
            task_results=[
                {"name": "config_init", "status": "success", "result": "CONFIG:exists"},
                {"name": "git_status", "status": "success", "result": "STATUS:2 files"},
            ],
            changed_paths=["src/a.py"],
        )

        self.assertIn("Latest Completion Session", session)
        self.assertIn("config_init", session)
        self.assertIn("git_diff", session)
        self.assertIn("not_run", session)
        self.assertIn("Session summary", session)


if __name__ == "__main__":
    unittest.main()

