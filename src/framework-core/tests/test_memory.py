"""Unit tests for shared memory synchronization helpers."""

import importlib.util
import os
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
    _detect_antigravity_runtime_rules,
    _sync_antigravity_manual_memory,
    _build_snapshot_auto_block,
    sync_shared_memory_task,
    _upsert_marked_block,
)


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _append_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    path.write_text(existing + content, encoding="utf-8")


def _seed_basic_antigravity_media_repo(root: Path) -> None:
    _write_text(root / ".claude" / "SNAPSHOT.md", "# SNAPSHOT — Antigravity\n")
    _write_text(
        root / "components" / "tree" / "builder-workspace.tsx",
        (
            'const MAX_MEDIA_FILES_PER_BATCH = 12;\n'
            'const a = "builder-media-limits-note";\n'
            'const b = "builder-media-progress-meta";\n'
            'const c = "XMLHttpRequest";\n'
            'const d = "PersonMediaGallery";\n'
            'const e = "variantPaths";\n'
            'const accept = \'accept="image/*,video/*"\';\n'
            'const multiple = "multiple";\n'
        ),
    )
    _write_text(root / "components" / "tree" / "tree-viewer-client.tsx", "PersonMediaGallery\n")
    _write_text(root / "components" / "tree" / "person-media-gallery.tsx", 'const url = "/api/media/id?variant=small";\n')
    _write_text(
        root / "tests" / "media-storage-e2e.mjs",
        (
            'const a = "smoke-video.webm";\n'
            'const b = "media-storage-report-";\n'
            'await assertMediaRedirect(`/api/media/${photoRecord.id}?variant=thumb`, "/variants/thumb.webp");\n'
            'fs.writeFileSync(reportPath, "{}");\n'
        ),
    )
    _write_text(root / "app" / "api" / "media" / "[mediaId]" / "route.ts", "const variant = searchParams.get('variant');\n")
    _write_text(root / "lib" / "tree" / "display.ts", 'const a = "/api/media/1?variant=thumb";\n')


def _seed_archive_foundation(root: Path) -> None:
    _seed_basic_antigravity_media_repo(root)
    _write_text(
        root / "components" / "layout" / "tree-nav.tsx",
        'const item = { href: withShareToken(`/tree/${slug}/media`, shareToken), label: "Медиа" };\n',
    )
    _write_text(
        root / "app" / "tree" / "[slug]" / "media" / "page.tsx",
        'import { TreeMediaArchiveClient } from "@/components/media/tree-media-archive-client";\n',
    )
    _write_text(
        root / "components" / "media" / "tree-media-archive-client.tsx",
        (
            'const pendingUploads = [];\n'
            'const isDiscardConfirmOpen = true;\n'
            'const title = "Подготовка загрузки";\n'
            'export function TreeMediaArchiveClient() { return null; }\n'
        ),
    )
    _write_text(
        root / "app" / "api" / "media" / "archive" / "upload-intent" / "route.ts",
        "createArchiveMediaUploadTarget\n",
    )
    _write_text(
        root / "app" / "api" / "media" / "archive" / "complete" / "route.ts",
        "completeArchiveMediaUpload\n",
    )
    _write_text(root / "app" / "api" / "media" / "albums" / "route.ts", "createTreeMediaAlbum\n")
    _write_text(
        root / "lib" / "server" / "repository.ts",
        (
            "tree_media_albums\n"
            "media_asset_variants\n"
            "resolveMediaAccess\n"
            "createArchiveMediaUploadTarget\n"
            "completeArchiveMediaUpload\n"
        ),
    )
    _write_text(
        root / "lib" / "env.ts",
        (
            'const backend = "cloudflare_r2";\n'
            'const bucket = process.env.CF_R2_BUCKET;\n'
        ),
    )
    _write_text(root / "cloudflare" / "r2-cors.json", "{\n  \"rules\": []\n}\n")
    _write_text(root / "supabase" / "migrations" / "20260308063000_media_asset_variants_v1.sql", "create table media_asset_variants ();")
    _write_text(root / "supabase" / "migrations" / "20260308142000_tree_media_albums_v1.sql", "create table tree_media_albums ();")


def _seed_antigravity_runtime_rules(root: Path) -> None:
    _append_text(
        root / "lib" / "supabase" / "admin-rest.ts",
        (
            "// FRAMEWORK_RULE: Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.\n"
            "const x = process.env.SUPABASE_ADMIN_REST_TRANSPORT;\n"
            "function getAdminRestTransportMode() {}\n"
            "async function runNativeAdminRestRequests() {}\n"
            "async function runPowerShellAdminRestRequests() {}\n"
        ),
    )
    _append_text(root / "lib" / "supabase" / "server-fetch.ts", "async function powerShellFetch() {}\n")
    _append_text(
        root / "lib" / "server" / "repository.ts",
        (
            "// FRAMEWORK_RULE: Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.\n"
            "getTreeAuditPageContext\n"
            "getTreeMembersPageData\n"
            "getTreeMediaPageData\n"
            "getTreeSettingsPageData\n"
        ),
    )
    _append_text(root / "app" / "tree" / "[slug]" / "audit" / "page.tsx", "getTreeAuditPageContext\n")
    _append_text(root / "app" / "tree" / "[slug]" / "members" / "page.tsx", "getTreeMembersPageData\n")
    _append_text(root / "app" / "tree" / "[slug]" / "media" / "page.tsx", "getTreeMediaPageData\n")
    _append_text(root / "app" / "tree" / "[slug]" / "settings" / "page.tsx", "getTreeSettingsPageData\n")
    _append_text(root / ".codex" / "commands" / "start.sh", "bash .codex/commands/start.sh\n")


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

    def test_detect_antigravity_media_status_tracks_archive_foundation_and_cloudflare(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_archive_foundation(root)

            status = _detect_antigravity_media_status(root)

            self.assertTrue(status["has_archive_nav"])
            self.assertTrue(status["has_archive_surface"])
            self.assertTrue(status["has_archive_upload_api"])
            self.assertTrue(status["has_album_support"])
            self.assertTrue(status["has_archive_upload_review"])
            self.assertTrue(status["has_archive_foundation"])
            self.assertTrue(status["has_variant_schema"])
            self.assertTrue(status["has_variant_delivery"])
            self.assertTrue(status["has_cloudflare_foundation"])

    def test_detect_antigravity_runtime_rules_tracks_transport_loader_and_bash_rules(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_antigravity_runtime_rules(root)

            rules = _detect_antigravity_runtime_rules(root)

            self.assertTrue(rules["has_native_first_admin_rest"])
            self.assertTrue(rules["has_specialized_tree_page_loaders"])
            self.assertTrue(rules["has_bash_runtime_dependency"])

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

    def test_sync_antigravity_manual_memory_captures_active_task_and_latest_smoke_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_archive_foundation(root)
            _seed_antigravity_runtime_rules(root)
            _write_text(
                root / "tasks" / "active" / "media-upload-flow-v2" / "task.md",
                (
                    "# Task\n\n"
                    "## Title\n\n"
                    "Media Upload Flow V2\n\n"
                    "## Status\n\n"
                    "in_progress\n\n"
                    "## Priority\n\n"
                    "high\n"
                ),
            )
            _write_text(
                root / ".claude" / "SNAPSHOT.md",
                (
                    "# SNAPSHOT — Antigravity\n\n"
                    "*Last updated: 2026-03-07*\n\n"
                    "## Current State\n\n"
                    "- stale\n\n"
                ),
            )
            _write_text(
                root / ".claude" / "ARCHITECTURE.md",
                (
                    "# ARCHITECTURE — Antigravity\n\n"
                    "## Manual Notes\n\n"
                    "- stale\n"
                ),
            )
            _write_text(
                root / ".claude" / "BACKLOG.md",
                (
                    "# BACKLOG — Antigravity\n\n"
                    "*Updated: 2026-03-07*\n\n"
                    "## Active Sprint\n\n"
                    "### High Priority\n\n"
                    "- [ ] stale\n"
                ),
            )
            _write_text(
                root / "tests" / "artifacts" / "media-storage-report-1772973411249.json",
                (
                    "{"
                    "\"ok\": false,"
                    "\"diagnostics\": {"
                    "\"error\": \"page.goto: Timeout 30000ms exceeded.\\nCall log: ...\""
                    "}"
                    "}"
                ),
            )

            updated = _sync_antigravity_manual_memory(root, "2026-03-09 07:20:00Z", "main")

            snapshot_path = root / ".claude" / "SNAPSHOT.md"
            backlog_path = root / ".claude" / "BACKLOG.md"
            architecture_path = root / ".claude" / "ARCHITECTURE.md"
            self.assertIn(snapshot_path.as_posix(), updated)
            self.assertIn(backlog_path.as_posix(), updated)
            self.assertIn(architecture_path.as_posix(), updated)

            snapshot = snapshot_path.read_text(encoding="utf-8")
            backlog = backlog_path.read_text(encoding="utf-8")
            architecture = architecture_path.read_text(encoding="utf-8")

            self.assertIn("## Current Active Task", snapshot)
            self.assertIn("`tasks/active/media-upload-flow-v2`", snapshot)
            self.assertIn("`Media Upload Flow V2`", snapshot)
            self.assertIn("## Completion Capture", snapshot)
            self.assertIn("## Runtime Rules", snapshot)
            self.assertIn("tree-level `Медиа` route", snapshot)
            self.assertIn("Cloudflare R2 foundation", snapshot)
            self.assertIn("media-storage-report-1772973411249.json", snapshot)
            self.assertIn("page.goto: Timeout 30000ms exceeded.", snapshot)
            self.assertIn("native Node fetch", snapshot)
            self.assertIn("specialized repository page-data loaders", snapshot)

            self.assertIn("*Updated: 2026-03-09*", backlog)
            self.assertIn("Починить `smoke:media`", backlog)
            self.assertIn("Довести уже созданный tree-level раздел `Медиа`", backlog)
            self.assertIn("Cloudflare migration plan поверх уже добавленного R2 foundation", backlog)

            self.assertIn("## Current Media Architecture", architecture)
            self.assertIn("## Current Runtime Rules", architecture)
            self.assertIn("/tree/[slug]/media", architecture)
            self.assertIn("tree_media_albums", architecture)
            self.assertIn("Cloudflare R2 foundation", architecture)
            self.assertIn("page.goto: Timeout 30000ms exceeded.", architecture)
            self.assertIn("native Node fetch is preferred", architecture)

    def test_sync_antigravity_manual_memory_includes_framework_rule_markers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_archive_foundation(root)
            _seed_antigravity_runtime_rules(root)
            _append_text(root / "lib" / "custom-runtime.ts", "// FRAMEWORK_RULE: Custom marker-driven runtime rule should surface in startup memory.\n")
            _write_text(root / ".claude" / "SNAPSHOT.md", "# SNAPSHOT — Antigravity\n",)
            _write_text(root / ".claude" / "ARCHITECTURE.md", "# ARCHITECTURE — Antigravity\n")
            _write_text(root / ".claude" / "BACKLOG.md", "# BACKLOG — Antigravity\n")

            _sync_antigravity_manual_memory(root, "2026-03-09 12:00:00Z", "main")

            snapshot = (root / ".claude" / "SNAPSHOT.md").read_text(encoding="utf-8")
            architecture = (root / ".claude" / "ARCHITECTURE.md").read_text(encoding="utf-8")

            self.assertIn("Custom marker-driven runtime rule should surface in startup memory.", snapshot)
            self.assertIn("Custom marker-driven runtime rule should surface in startup memory.", architecture)

    def test_sync_antigravity_manual_memory_updates_operational_docs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_archive_foundation(root)
            _seed_antigravity_runtime_rules(root)
            _append_text(
                root / "components" / "tree" / "builder-workspace.tsx",
                "Инфо\nФото\nВидео\npendingMediaUploads\nСохранить\n",
            )
            _write_text(
                root / "docs" / "research" / "family-tree-v1-slava-edition-owner-playbook-2026-03-06.md",
                "# Family Tree V1.0 \"Slava Edition\" Owner Playbook (2026-03-06)\n\n## Legacy\n\nstale\n",
            )
            _write_text(
                root / "docs" / "research" / "family-tree-v1-slava-edition-launch-checklist-2026-03-06.md",
                "# Family Tree V1.0 \"Slava Edition\" Launch and UAT Checklist (2026-03-06)\n\n## Legacy\n\nstale\n",
            )
            _write_text(
                root / "docs" / "research" / "family-tree-v1-slava-edition-backup-restore-runbook-2026-03-06.md",
                "# Family Tree V1.0 \"Slava Edition\" Backup and Restore Runbook (2026-03-06)\n\n## Legacy\n\nstale\n",
            )
            _write_text(
                root / "tests" / "artifacts" / "media-storage-report-1773292460891.json",
                "{\"ok\": true}",
            )

            updated = _sync_antigravity_manual_memory(root, "2026-03-12 09:00:00Z", "main")

            owner_path = root / "docs" / "research" / "family-tree-v1-slava-edition-owner-playbook-2026-03-06.md"
            launch_path = root / "docs" / "research" / "family-tree-v1-slava-edition-launch-checklist-2026-03-06.md"
            backup_path = root / "docs" / "research" / "family-tree-v1-slava-edition-backup-restore-runbook-2026-03-06.md"

            self.assertIn(owner_path.as_posix(), updated)
            self.assertIn(launch_path.as_posix(), updated)
            self.assertIn(backup_path.as_posix(), updated)

            owner = owner_path.read_text(encoding="utf-8")
            launch = launch_path.read_text(encoding="utf-8")
            backup = backup_path.read_text(encoding="utf-8")

            self.assertIn("<!-- FRAMEWORK:PLAYBOOK:START -->", owner)
            self.assertIn("## Current Operational Sync", owner)
            self.assertIn("`Инфо` for person data and documents", owner)
            self.assertIn("tree-level `Медиа` is the family archive", owner)
            self.assertLess(owner.index("<!-- FRAMEWORK:PLAYBOOK:START -->"), owner.index("## Legacy"))

            self.assertIn("<!-- FRAMEWORK:LAUNCH:START -->", launch)
            self.assertIn("## Current Launch Sync", launch)
            self.assertIn("Launch is currently blocked until `Cloudflare R2` rollout is activated", launch)
            self.assertIn("Latest `smoke:media` artifact `media-storage-report-1773292460891.json` is green.", launch)
            self.assertLess(launch.index("<!-- FRAMEWORK:LAUNCH:START -->"), launch.index("## Legacy"))

            self.assertIn("<!-- FRAMEWORK:RECOVERY:START -->", backup)
            self.assertIn("## Current Recovery Sync", backup)
            self.assertIn("new uploads must move to `Cloudflare R2` before release", backup)
            self.assertIn("legacy Yandex-backed media must remain readable", backup)
            self.assertLess(backup.index("<!-- FRAMEWORK:RECOVERY:START -->"), backup.index("## Legacy"))

    def test_sync_antigravity_manual_memory_updates_plan_docs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_archive_foundation(root)
            _seed_antigravity_runtime_rules(root)
            _append_text(
                root / "components" / "tree" / "builder-workspace.tsx",
                "Инфо\nФото\nВидео\npendingMediaUploads\nСохранить\n",
            )
            _write_text(
                root / "tasks" / "active" / "media-upload-flow-v2" / "task.md",
                (
                    "# Task\n\n"
                    "## Title\n\n"
                    "Media Upload Flow V2\n\n"
                    "## Status\n\n"
                    "in_progress\n\n"
                    "## Priority\n\n"
                    "high\n"
                ),
            )
            _write_text(
                root / "docs" / "research" / "family-tree-v1-slava-edition-plan-2026-03-06.md",
                "# Family Tree V1.0 \"Slava Edition\" Plan (2026-03-06)\n\n## Legacy\n\nstale\n",
            )
            _write_text(
                root / "docs" / "research" / "family-tree-v1-slava-edition-implementation-plan-2026-03-06.md",
                "# Family Tree V1.0 \"Slava Edition\" Implementation Plan (2026-03-06)\n\n## Legacy\n\nstale\n",
            )
            _write_text(
                root / "docs" / "research" / "family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md",
                "# Family Tree V1.0 \"Slava Edition\" Engineering Backlog (2026-03-06)\n\n## Legacy\n\nstale\n",
            )
            _write_text(
                root / "tests" / "artifacts" / "media-storage-report-1773292460891.json",
                "{\"ok\": true}",
            )

            updated = _sync_antigravity_manual_memory(root, "2026-03-12 09:30:00Z", "main")

            plan_path = root / "docs" / "research" / "family-tree-v1-slava-edition-plan-2026-03-06.md"
            implementation_path = root / "docs" / "research" / "family-tree-v1-slava-edition-implementation-plan-2026-03-06.md"
            engineering_path = root / "docs" / "research" / "family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md"

            self.assertIn(plan_path.as_posix(), updated)
            self.assertIn(implementation_path.as_posix(), updated)
            self.assertIn(engineering_path.as_posix(), updated)

            plan = plan_path.read_text(encoding="utf-8")
            implementation = implementation_path.read_text(encoding="utf-8")
            engineering = engineering_path.read_text(encoding="utf-8")

            self.assertIn("<!-- FRAMEWORK:PLAN:START -->", plan)
            self.assertIn("## Current Plan Sync", plan)
            self.assertIn("Current primary workstream: `Media Upload Flow V2`", plan)
            self.assertIn("Cloudflare R2` rollout is mandatory", plan)
            self.assertLess(plan.index("<!-- FRAMEWORK:PLAN:START -->"), plan.index("## Legacy"))

            self.assertIn("<!-- FRAMEWORK:IMPLEMENTATION:START -->", implementation)
            self.assertIn("## Current Implementation Sync", implementation)
            self.assertIn("Workstreams `A-D` are largely materialized in the repo", implementation)
            self.assertIn("### Current Launch Gaps", implementation)
            self.assertIn("Live `EU + RF` UAT is still a launch gate.", implementation)
            self.assertLess(implementation.index("<!-- FRAMEWORK:IMPLEMENTATION:START -->"), implementation.index("## Legacy"))

            self.assertIn("<!-- FRAMEWORK:ENGINEERING:START -->", engineering)
            self.assertIn("## Current Engineering Sync", engineering)
            self.assertIn("### Current P0 Launch Order", engineering)
            self.assertIn("### Current P0 Gaps", engineering)
            self.assertIn("Latest `smoke:media` artifact `media-storage-report-1773292460891.json` is green.", engineering)
            self.assertLess(engineering.index("<!-- FRAMEWORK:ENGINEERING:START -->"), engineering.index("## Legacy"))

    def test_sync_shared_memory_task_keeps_antigravity_snapshot_and_backlog_free_of_framework_telemetry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _seed_archive_foundation(root)
            _seed_antigravity_runtime_rules(root)
            _write_text(root / "package.json", '{"name":"antigravity-docs-test"}')
            _write_text(
                root / ".claude" / "SNAPSHOT.md",
                (
                    "# SNAPSHOT — Antigravity\n\n"
                    "<!-- FRAMEWORK:AUTO:START -->\n"
                    "stale auto\n"
                    "<!-- FRAMEWORK:AUTO:END -->\n\n"
                    "<!-- FRAMEWORK:SESSION:START -->\n"
                    "stale session\n"
                    "<!-- FRAMEWORK:SESSION:END -->\n"
                ),
            )
            _write_text(
                root / ".claude" / "BACKLOG.md",
                (
                    "# BACKLOG — Antigravity\n\n"
                    "<!-- FRAMEWORK:AUTO:START -->\n"
                    "stale auto\n"
                    "<!-- FRAMEWORK:AUTO:END -->\n\n"
                    "<!-- FRAMEWORK:SESSION:START -->\n"
                    "stale session\n"
                    "<!-- FRAMEWORK:SESSION:END -->\n"
                ),
            )
            _write_text(root / ".claude" / "ARCHITECTURE.md", "# ARCHITECTURE — Antigravity\n")

            previous_cwd = Path.cwd()
            try:
                os.chdir(root)
                result = sync_shared_memory_task(
                    git_status_result="STATUS:2 files",
                    git_diff_result="DIFF:11 lines",
                    task_results=[
                        {"name": "config_init", "status": "success", "result": "CONFIG:exists"},
                        {"name": "git_status", "status": "success", "result": "STATUS:2 files"},
                    ],
                )
            finally:
                os.chdir(previous_cwd)

            self.assertEqual(result.get("status"), "success")

            snapshot = (root / ".claude" / "SNAPSHOT.md").read_text(encoding="utf-8")
            backlog = (root / ".claude" / "BACKLOG.md").read_text(encoding="utf-8")
            architecture = (root / ".claude" / "ARCHITECTURE.md").read_text(encoding="utf-8")

            self.assertNotIn("FRAMEWORK:AUTO", snapshot)
            self.assertNotIn("FRAMEWORK:SESSION", snapshot)
            self.assertIn("## Current State", snapshot)

            self.assertNotIn("FRAMEWORK:AUTO", backlog)
            self.assertNotIn("FRAMEWORK:SESSION", backlog)
            self.assertIn("## Active Sprint", backlog)

            self.assertIn("FRAMEWORK:AUTO", architecture)
            self.assertIn("FRAMEWORK:SESSION", architecture)


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
                "SYSTEM_INVARIANTS.md",
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
                    "\"SYSTEM_INVARIANTS.md\","
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
