"""Unit tests for shared memory synchronization helpers."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


FRAMEWORK_CORE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(FRAMEWORK_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(FRAMEWORK_CORE_ROOT))

BACKLOG_HINT_PATH = REPO_ROOT / ".codex" / "utils" / "backlog-start-hint.py"
BACKLOG_HINT_SPEC = importlib.util.spec_from_file_location("backlog_start_hint", BACKLOG_HINT_PATH)
if BACKLOG_HINT_SPEC is None or BACKLOG_HINT_SPEC.loader is None:
    raise RuntimeError(f"Unable to load backlog hint module from {BACKLOG_HINT_PATH}")
backlog_start_hint = importlib.util.module_from_spec(BACKLOG_HINT_SPEC)
BACKLOG_HINT_SPEC.loader.exec_module(backlog_start_hint)

from tasks.config import get_context_files  # noqa: E402
from tasks.memory import (  # noqa: E402
    _build_antigravity_backlog_active_sprint,
    _build_architecture_state_block,
    _build_architecture_auto_block,
    _build_backlog_auto_block,
    _build_latest_session_block,
    _build_antigravity_snapshot_sections,
    _detect_antigravity_media_status,
    _sync_antigravity_manual_memory,
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

    def test_build_architecture_state_block_reflects_live_app_shape(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "app").mkdir()
            (root / "components").mkdir()
            (root / "lib").mkdir()
            (root / "supabase").mkdir()
            (root / "legacy").mkdir()
            (root / "tests").mkdir()
            (root / "tsconfig.json").write_text("{}", encoding="utf-8")
            (root / "package.json").write_text(
                (
                    "{"
                    "\"dependencies\":{\"next\":\"16.1.6\",\"react\":\"19.2.4\",\"@supabase/supabase-js\":\"2.98.0\"},"
                    "\"devDependencies\":{\"typescript\":\"5.9.3\"}"
                    "}"
                ),
                encoding="utf-8",
            )

            state = _build_architecture_state_block(root, "2026-03-06 10:30:00Z")

            self.assertIn("Next.js App Router web application", state)
            self.assertIn("Next.js 16.1.6 + React 19.2.4 + TypeScript + Supabase", state)
            self.assertIn("Supabase auth, database, RLS, and storage", state)
            self.assertIn("legacy/", state)
            self.assertIn("source of truth", state)

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

    def test_detect_antigravity_media_status_tracks_completed_upload_flow(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / ".claude").mkdir()
            (root / "components" / "tree").mkdir(parents=True)
            (root / "tests").mkdir()
            (root / "app" / "api" / "media" / "[mediaId]").mkdir(parents=True)
            (root / "lib" / "tree").mkdir(parents=True)

            (root / ".claude" / "SNAPSHOT.md").write_text("# SNAPSHOT — Antigravity\n", encoding="utf-8")
            (root / "components" / "tree" / "builder-workspace.tsx").write_text(
                (
                    'const MAX_MEDIA_FILES_PER_BATCH = 12;\n'
                    'const a = "builder-media-limits-note";\n'
                    'const b = "builder-media-progress-meta";\n'
                    'const c = "XMLHttpRequest";\n'
                    'const d = "PersonMediaGallery";\n'
                    'const accept = \'accept="image/*,video/*"\';\n'
                    'const multiple = "multiple";\n'
                ),
                encoding="utf-8",
            )
            (root / "components" / "tree" / "tree-viewer-client.tsx").write_text("PersonMediaGallery\n", encoding="utf-8")
            (root / "components" / "tree" / "person-media-gallery.tsx").write_text("gallery\n", encoding="utf-8")
            (root / "tests" / "media-storage-e2e.mjs").write_text(
                'const a = "smoke-video.webm"; const b = "media-storage-report-"; fs.writeFileSync(reportPath, "{}");\n',
                encoding="utf-8",
            )
            (root / "app" / "api" / "media" / "[mediaId]" / "route.ts").write_text("redirect(result.url)\n", encoding="utf-8")
            (root / "lib" / "tree" / "display.ts").write_text("buildPersonPhotoPreviewUrls\n", encoding="utf-8")

            status = _detect_antigravity_media_status(root)

            self.assertTrue(status["has_multi_file_upload"])
            self.assertTrue(status["has_device_video_upload"])
            self.assertTrue(status["has_limits_copy"])
            self.assertTrue(status["has_progress_ui"])
            self.assertTrue(status["has_media_gallery"])
            self.assertTrue(status["has_smoke_report"])
            self.assertTrue(status["upload_flow_complete"])
            self.assertFalse(status["has_variant_delivery"])

    def test_sync_antigravity_manual_memory_rewrites_stale_snapshot_and_backlog(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / ".claude").mkdir()
            (root / "components" / "tree").mkdir(parents=True)
            (root / "tests").mkdir()
            (root / "app" / "api" / "media" / "[mediaId]").mkdir(parents=True)
            (root / "lib" / "tree").mkdir(parents=True)

            (root / "components" / "tree" / "builder-workspace.tsx").write_text(
                (
                    'const MAX_MEDIA_FILES_PER_BATCH = 12;\n'
                    'const a = "builder-media-limits-note";\n'
                    'const b = "builder-media-progress-meta";\n'
                    'const c = "XMLHttpRequest";\n'
                    'const d = "PersonMediaGallery";\n'
                    'const accept = \'accept="image/*,video/*"\';\n'
                    'const multiple = "multiple";\n'
                ),
                encoding="utf-8",
            )
            (root / "components" / "tree" / "tree-viewer-client.tsx").write_text("PersonMediaGallery\n", encoding="utf-8")
            (root / "components" / "tree" / "person-media-gallery.tsx").write_text("gallery\n", encoding="utf-8")
            (root / "tests" / "media-storage-e2e.mjs").write_text(
                'const a = "smoke-video.webm"; const b = "media-storage-report-"; fs.writeFileSync(reportPath, "{}");\n',
                encoding="utf-8",
            )
            (root / "app" / "api" / "media" / "[mediaId]" / "route.ts").write_text("redirect(result.url)\n", encoding="utf-8")
            (root / "lib" / "tree" / "display.ts").write_text("buildPersonPhotoPreviewUrls\n", encoding="utf-8")

            snapshot_path = root / ".claude" / "SNAPSHOT.md"
            backlog_path = root / ".claude" / "BACKLOG.md"
            snapshot_path.write_text(
                (
                    "# SNAPSHOT — Antigravity\n\n"
                    "*Last updated: 2026-03-07*\n\n"
                    "## Current State\n\n"
                    "- Current workstream: stale\n\n"
                    "## Active Blockers\n\n"
                    "- [ ] Current media upload UX is still not archive-ready: no multi-file flow, no device video upload in the main path, no progress, no limits copy.\n\n"
                    "## Current Focus\n\n"
                    "- [ ] Rebuild the media upload UX around one human-friendly local-file flow for photos and videos.\n\n"
                    "## Next Steps\n\n"
                    "- [ ] Fix `spawn ENAMETOOLONG` in the upload path and confirm a stable multi-file upload loop.\n"
                ),
                encoding="utf-8",
            )
            backlog_path.write_text(
                (
                    "# BACKLOG — Antigravity\n\n"
                    "*Updated: 2026-03-07*\n\n"
                    "## Active Sprint\n\n"
                    "### High Priority\n\n"
                    "- [ ] Пересобрать media upload flow под реальный архивный сценарий: единый upload для фото и видео с устройства, multi-file, прогресс, лимиты и устранение `spawn ENAMETOOLONG`.\n\n"
                    "### Medium Priority\n\n"
                    "- [ ] Medium\n\n"
                    "### Low Priority\n\n"
                    "- [ ] Low\n"
                ),
                encoding="utf-8",
            )

            updated = _sync_antigravity_manual_memory(root, "2026-03-08 06:00:00Z", "main")

            self.assertIn(snapshot_path.as_posix(), updated)
            self.assertIn(backlog_path.as_posix(), updated)

            snapshot = snapshot_path.read_text(encoding="utf-8")
            backlog = backlog_path.read_text(encoding="utf-8")

            self.assertIn("*Last updated: 2026-03-08*", snapshot)
            self.assertIn("Unified local-file upload now covers photos and videos from device in one flow.", snapshot)
            self.assertIn("Viewer and builder now expose an in-app media gallery", snapshot)
            self.assertNotIn("no multi-file flow", snapshot)
            self.assertNotIn("Fix `spawn ENAMETOOLONG` in the upload path", snapshot)

            self.assertIn("*Updated: 2026-03-08*", backlog)
            self.assertIn("thumbnail/variant architecture", backlog)
            self.assertNotIn("Пересобрать media upload flow", backlog)


class StartupContextTests(unittest.TestCase):
    def test_get_context_files_uses_startup_context_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / ".claude").mkdir()
            (root / ".codex" / "config").mkdir(parents=True)

            expected_files = [
                ".claude/SNAPSHOT.md",
                ".claude/BACKLOG.md",
                ".claude/ARCHITECTURE.md",
                "README.md",
                "PROJECT_SUMMARY.md",
                "REPO_MAP.md",
                "TREE_MODEL.md",
                "TREE_ALGORITHMS.md",
                "DATA_FLOW.md",
                "ARCHITECTURE_RULES.md",
                "DECISIONS.md",
                "COMMON_BUGS.md",
            ]

            for relative_path in expected_files:
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("ok\n", encoding="utf-8")

            (root / ".codex" / "config" / "framework-adapter.json").write_text(
                (
                    "{"
                    "\"startup_context_paths\":["
                    "\".claude/SNAPSHOT.md\","
                    "\".claude/BACKLOG.md\","
                    "\".claude/ARCHITECTURE.md\","
                    "\"README.md\","
                    "\"PROJECT_SUMMARY.md\","
                    "\"REPO_MAP.md\","
                    "\"TREE_MODEL.md\","
                    "\"TREE_ALGORITHMS.md\","
                    "\"DATA_FLOW.md\","
                    "\"ARCHITECTURE_RULES.md\","
                    "\"DECISIONS.md\","
                    "\"COMMON_BUGS.md\""
                    "]"
                    "}"
                ),
                encoding="utf-8",
            )

            self.assertEqual(get_context_files(root), expected_files)


class BacklogHintTests(unittest.TestCase):
    def test_resolve_update_timestamp_prefers_latest_embedded_refresh(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            backlog_path = Path(temp_dir) / "BACKLOG.md"
            backlog_path.write_text(
                (
                    "# BACKLOG\n\n"
                    "*Updated: 2026-03-02*\n\n"
                    "## Framework Auto Sync\n\n"
                    "- Updated at (UTC): `2026-03-06 23:29:07Z`\n\n"
                    "## Latest Completion Session\n\n"
                    "- Completed at (UTC): `2026-03-06 23:29:07Z`\n"
                ),
                encoding="utf-8",
            )

            resolved, source = backlog_start_hint._resolve_update_timestamp(
                backlog_path,
                backlog_path.read_text(encoding="utf-8"),
            )

            self.assertEqual(source, "embedded")
            self.assertEqual(
                resolved,
                backlog_start_hint.datetime(2026, 3, 6, 23, 29, 7, tzinfo=backlog_start_hint.timezone.utc),
            )


if __name__ == "__main__":
    unittest.main()
