"""Shared memory synchronization tasks for completion."""

import json
import logging
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from tasks.config import _detect_branch, _detect_stack, _top_level_structure
from utils.parallel import time_task
from utils.result import create_task_result


STATE_FILES = (
    ".claude/SNAPSHOT.md",
    ".claude/BACKLOG.md",
    ".claude/ARCHITECTURE.md",
)

ANTIGRAVITY_OWNER_PLAYBOOK_PATH = "docs/research/family-tree-v1-slava-edition-owner-playbook-2026-03-06.md"
ANTIGRAVITY_LAUNCH_CHECKLIST_PATH = "docs/research/family-tree-v1-slava-edition-launch-checklist-2026-03-06.md"
ANTIGRAVITY_BACKUP_RUNBOOK_PATH = "docs/research/family-tree-v1-slava-edition-backup-restore-runbook-2026-03-06.md"
ANTIGRAVITY_PLAN_DOC_PATH = "docs/research/family-tree-v1-slava-edition-plan-2026-03-06.md"
ANTIGRAVITY_IMPLEMENTATION_PLAN_PATH = "docs/research/family-tree-v1-slava-edition-implementation-plan-2026-03-06.md"
ANTIGRAVITY_ENGINEERING_BACKLOG_PATH = "docs/research/family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md"

MEMORY_SYNC_DEFAULTS = {
    "enabled": True,
    "mode": "hybrid",
    "on_completion": "always",
}

KEY_SESSION_TASKS = (
    "config_init",
    "project_baseline",
    "security_cleanup",
    "dialog_export",
    "git_status",
    "git_diff",
)
FRAMEWORK_RULE_PREFIX = "FRAMEWORK_RULE:"


def _utc_now_label() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def _read_framework_config(root: Path) -> Dict[str, object]:
    config_path = root / ".claude" / ".framework-config"
    if not config_path.exists():
        return {}
    try:
        with open(config_path, encoding="utf-8") as file_handle:
            payload = json.load(file_handle)
        if isinstance(payload, dict):
            return payload
    except Exception:
        logging.exception("memory_sync: failed to read .framework-config")
    return {}


def _resolve_memory_sync_config(root: Path) -> Dict[str, object]:
    config = _read_framework_config(root)
    current = config.get("memory_sync", {})
    resolved = dict(MEMORY_SYNC_DEFAULTS)
    if isinstance(current, dict):
        for key in resolved.keys():
            if key in current:
                resolved[key] = current[key]
    return resolved


def _collect_changed_paths(limit: int = 15) -> List[str]:
    try:
        result = subprocess.run(
            ["git", "status", "--short"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        logging.exception("memory_sync: git status invocation failed")
        return []

    if result.returncode != 0:
        return []

    paths: List[str] = []
    for raw_line in (result.stdout or "").splitlines():
        line = raw_line.rstrip()
        if len(line) < 4:
            continue
        candidate = line[3:].strip()
        if not candidate:
            continue
        if " -> " in candidate:
            candidate = candidate.split(" -> ", 1)[1].strip()
        if candidate.startswith('"') and candidate.endswith('"'):
            candidate = candidate[1:-1]
        if candidate not in paths:
            paths.append(candidate)
        if len(paths) >= limit:
            break

    return paths


def _extract_first_number(value: str) -> Optional[int]:
    match = re.search(r":\s*(\d+)\b", value or "")
    if not match:
        return None
    return int(match.group(1))


def _upsert_marked_block(path: Path, marker_id: str, content: str) -> bool:
    start_marker = f"<!-- {marker_id}:START -->"
    end_marker = f"<!-- {marker_id}:END -->"
    block = f"{start_marker}\n{content.rstrip()}\n{end_marker}"

    existing = ""
    if path.exists():
        existing = path.read_text(encoding="utf-8", errors="ignore")

    start_index = existing.find(start_marker)
    end_index = existing.find(end_marker, start_index + len(start_marker)) if start_index >= 0 else -1

    if start_index >= 0 and end_index >= 0 and start_index < end_index:
        new_content = existing[:start_index] + block + existing[end_index + len(end_marker):]
    else:
        base = existing.rstrip("\n")
        if base:
            new_content = f"{base}\n\n{block}\n"
        else:
            new_content = f"{block}\n"

    if new_content == existing:
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new_content, encoding="utf-8")
    return True


def _remove_marked_block(path: Path, marker_id: str) -> bool:
    if not path.exists():
        return False

    start_marker = f"<!-- {marker_id}:START -->"
    end_marker = f"<!-- {marker_id}:END -->"
    existing = path.read_text(encoding="utf-8", errors="ignore")
    pattern = re.compile(
        rf"\n*{re.escape(start_marker)}\n.*?\n{re.escape(end_marker)}\n*",
        re.DOTALL,
    )
    updated, count = pattern.subn("\n\n", existing, count=1)
    updated = re.sub(r"\n{3,}", "\n\n", updated).rstrip() + ("\n" if updated.strip() else "")

    if count == 0 or updated == existing:
        return False

    path.write_text(updated, encoding="utf-8")
    return True


def _upsert_marked_block_after_title(path: Path, marker_id: str, content: str) -> bool:
    start_marker = f"<!-- {marker_id}:START -->"
    end_marker = f"<!-- {marker_id}:END -->"
    block = f"{start_marker}\n{content.rstrip()}\n{end_marker}"

    existing = ""
    if path.exists():
        existing = path.read_text(encoding="utf-8", errors="ignore")

    start_index = existing.find(start_marker)
    end_index = existing.find(end_marker, start_index + len(start_marker)) if start_index >= 0 else -1

    if start_index >= 0 and end_index >= 0 and start_index < end_index:
        new_content = existing[:start_index] + block + existing[end_index + len(end_marker):]
    else:
        title_match = re.match(r"^(# .+?)(\r?\n|$)", existing)
        if title_match:
            title = title_match.group(1)
            remainder = existing[title_match.end():].lstrip("\r\n")
            new_content = f"{title}\n\n{block}\n"
            if remainder:
                new_content += f"\n{remainder}"
        elif existing.strip():
            new_content = f"{block}\n\n{existing.lstrip()}"
        else:
            new_content = f"{block}\n"

    if new_content == existing:
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new_content, encoding="utf-8")
    return True


def _build_markdown_lines(rows: Iterable[str]) -> str:
    values = [item for item in rows if item]
    return "\n".join(values) if values else "- `<none>`"


def _read_text_or_empty(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _first_nonempty_line(value: str) -> str:
    for raw_line in (value or "").splitlines():
        line = raw_line.strip()
        if line:
            return line
    return ""


def _extract_markdown_section_text(content: str, heading: str) -> str:
    pattern = re.compile(
        rf"^## {re.escape(heading)}\n\n(.*?)(?=^## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(content or "")
    if not match:
        return ""
    return match.group(1).strip()


def _load_active_task_capsules(root: Path) -> List[Dict[str, str]]:
    active_root = root / "tasks" / "active"
    if not active_root.exists():
        return []

    capsules: List[Dict[str, str]] = []
    for task_file in sorted(active_root.glob("*/task.md")):
        task_text = _read_text_or_empty(task_file)
        title = _first_nonempty_line(_extract_markdown_section_text(task_text, "Title")) or task_file.parent.name
        status = _first_nonempty_line(_extract_markdown_section_text(task_text, "Status")) or "unknown"
        priority = _first_nonempty_line(_extract_markdown_section_text(task_text, "Priority")) or "unknown"
        capsules.append(
            {
                "path": task_file.parent.relative_to(root).as_posix(),
                "title": title,
                "status": status,
                "priority": priority,
            }
        )

    return capsules


def _load_latest_media_smoke_report(root: Path) -> Dict[str, object]:
    artifacts_root = root / "tests" / "artifacts"
    if not artifacts_root.exists():
        return {"exists": False, "ok": False, "name": None, "error_summary": None}

    reports = sorted(
        artifacts_root.glob("media-storage-report-*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not reports:
        return {"exists": False, "ok": False, "name": None, "error_summary": None}

    report_path = reports[0]
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        logging.exception("memory_sync: failed to parse media smoke report %s", report_path)
        return {
            "exists": True,
            "ok": False,
            "name": report_path.name,
            "error_summary": "latest artifact could not be parsed",
        }

    diagnostics = payload.get("diagnostics", {}) if isinstance(payload, dict) else {}
    raw_error = diagnostics.get("error") if isinstance(diagnostics, dict) else None
    error_summary = None
    if isinstance(raw_error, str) and raw_error.strip():
        error_summary = raw_error.strip().splitlines()[0][:220]

    return {
        "exists": True,
        "ok": bool(payload.get("ok")) if isinstance(payload, dict) else False,
        "name": report_path.name,
        "error_summary": error_summary,
    }


def _replace_line(content: str, pattern: str, replacement: str) -> Tuple[str, bool]:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)
    return updated, count > 0 and updated != content


def _replace_top_level_section(content: str, heading: str, body: str) -> Tuple[str, bool]:
    pattern = re.compile(
        rf"(^## {re.escape(heading)}\n\n)(.*?)(?=^## |\Z)",
        re.MULTILINE | re.DOTALL,
    )

    def _replacement(match: re.Match[str]) -> str:
        return f"{match.group(1)}{body.rstrip()}\n\n"

    updated, count = pattern.subn(_replacement, content, count=1)
    if count > 0:
        return updated, updated != content

    suffix = "" if content.endswith("\n") else "\n"
    appended = f"{content}{suffix}\n## {heading}\n\n{body.rstrip()}\n"
    return appended, True


def _write_if_changed(path: Path, next_content: str, previous_content: str) -> bool:
    if next_content == previous_content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(next_content, encoding="utf-8")
    return True


def _is_antigravity_repo(root: Path) -> bool:
    return (
        root.joinpath(".claude", "SNAPSHOT.md").exists()
        and root.joinpath("components", "tree", "builder-workspace.tsx").exists()
        and root.joinpath("tests", "media-storage-e2e.mjs").exists()
    )


def _detect_antigravity_media_status(root: Path) -> Dict[str, bool]:
    builder_text = _read_text_or_empty(root / "components" / "tree" / "builder-workspace.tsx")
    viewer_text = _read_text_or_empty(root / "components" / "tree" / "tree-viewer-client.tsx")
    gallery_text = _read_text_or_empty(root / "components" / "tree" / "person-media-gallery.tsx")
    smoke_text = _read_text_or_empty(root / "tests" / "media-storage-e2e.mjs")
    media_route_text = _read_text_or_empty(root / "app" / "api" / "media" / "[mediaId]" / "route.ts")
    display_text = _read_text_or_empty(root / "lib" / "tree" / "display.ts")
    nav_text = _read_text_or_empty(root / "components" / "layout" / "tree-nav.tsx")
    archive_page_text = _read_text_or_empty(root / "app" / "tree" / "[slug]" / "media" / "page.tsx")
    archive_client_text = _read_text_or_empty(root / "components" / "media" / "tree-media-archive-client.tsx")
    archive_upload_intent_text = _read_text_or_empty(root / "app" / "api" / "media" / "archive" / "upload-intent" / "route.ts")
    archive_complete_text = _read_text_or_empty(root / "app" / "api" / "media" / "archive" / "complete" / "route.ts")
    albums_route_text = _read_text_or_empty(root / "app" / "api" / "media" / "albums" / "route.ts")
    repo_text = _read_text_or_empty(root / "lib" / "server" / "repository.ts")
    env_text = _read_text_or_empty(root / "lib" / "env.ts")
    variants_migration_text = _read_text_or_empty(root / "supabase" / "migrations" / "20260308063000_media_asset_variants_v1.sql")
    albums_migration_text = _read_text_or_empty(root / "supabase" / "migrations" / "20260308142000_tree_media_albums_v1.sql")

    has_multi_file_upload = "MAX_MEDIA_FILES_PER_BATCH" in builder_text and "multiple" in builder_text
    has_device_video_upload = 'accept="image/*,video/*' in builder_text and "smoke-video.webm" in smoke_text
    has_limits_copy = "builder-media-limits-note" in builder_text
    has_progress_ui = "builder-media-progress-meta" in builder_text and "XMLHttpRequest" in builder_text
    has_person_media_tab_split = all(label in builder_text for label in ("Инфо", "Фото", "Видео"))
    has_person_upload_review = "pendingMediaUploads" in builder_text and "Сохранить" in builder_text
    has_media_gallery = (
        gallery_text != ""
        and "PersonMediaGallery" in builder_text
        and "PersonMediaGallery" in viewer_text
    )
    has_smoke_report = "media-storage-report-" in smoke_text and "fs.writeFileSync(reportPath" in smoke_text
    has_variant_delivery = (
        "media_asset_variants" in repo_text
        and "resolveMediaAccess" in repo_text
        and (
            "?variant=" in gallery_text
            or "?variant=" in display_text
            or "variant" in media_route_text
            or "variantPaths" in builder_text
        )
    )
    has_archive_nav = "/tree/${slug}/media" in nav_text and 'label: "Медиа"' in nav_text
    has_archive_surface = "TreeMediaArchiveClient" in archive_page_text and "TreeMediaArchiveClient" in archive_client_text
    has_archive_upload_api = "createArchiveMediaUploadTarget" in archive_upload_intent_text and "completeArchiveMediaUpload" in archive_complete_text
    has_album_support = (
        "createTreeMediaAlbum" in albums_route_text
        and "tree_media_albums" in repo_text
        and "tree_media_albums" in albums_migration_text
    )
    has_archive_upload_review = (
        "Подготовка загрузки" in archive_client_text
        and "pendingUploads" in archive_client_text
        and "isDiscardConfirmOpen" in archive_client_text
    )
    has_archive_viewer = (
        "archive-media-dialog" in archive_client_text
        and "isMediaViewerOpen" in archive_client_text
        and "moveViewerSelection" in archive_client_text
    )
    has_archive_sticky_actions = "archive-sticky-footer" in archive_client_text
    has_variant_schema = "media_asset_variants" in variants_migration_text
    has_cloudflare_foundation = (
        "cloudflare_r2" in env_text
        and "CF_R2_BUCKET" in env_text
        and root.joinpath("cloudflare", "r2-cors.json").exists()
    )
    has_archive_foundation = all(
        (
            has_archive_nav,
            has_archive_surface,
            has_archive_upload_api,
            has_album_support,
        )
    )

    return {
        "has_multi_file_upload": has_multi_file_upload,
        "has_device_video_upload": has_device_video_upload,
        "has_limits_copy": has_limits_copy,
        "has_progress_ui": has_progress_ui,
        "has_person_media_tab_split": has_person_media_tab_split,
        "has_person_upload_review": has_person_upload_review,
        "has_media_gallery": has_media_gallery,
        "has_smoke_report": has_smoke_report,
        "has_archive_nav": has_archive_nav,
        "has_archive_surface": has_archive_surface,
        "has_archive_upload_api": has_archive_upload_api,
        "has_album_support": has_album_support,
        "has_archive_upload_review": has_archive_upload_review,
        "has_archive_viewer": has_archive_viewer,
        "has_archive_sticky_actions": has_archive_sticky_actions,
        "has_archive_foundation": has_archive_foundation,
        "has_variant_schema": has_variant_schema,
        "has_variant_delivery": has_variant_delivery,
        "has_cloudflare_foundation": has_cloudflare_foundation,
        "upload_flow_complete": all(
            (
                has_multi_file_upload,
                has_device_video_upload,
                has_limits_copy,
                has_progress_ui,
            )
        ),
    }


def _detect_antigravity_runtime_rules(root: Path) -> Dict[str, bool]:
    admin_rest_text = _read_text_or_empty(root / "lib" / "supabase" / "admin-rest.ts")
    server_fetch_text = _read_text_or_empty(root / "lib" / "supabase" / "server-fetch.ts")
    repository_text = _read_text_or_empty(root / "lib" / "server" / "repository.ts")
    audit_page_text = _read_text_or_empty(root / "app" / "tree" / "[slug]" / "audit" / "page.tsx")
    members_page_text = _read_text_or_empty(root / "app" / "tree" / "[slug]" / "members" / "page.tsx")
    media_page_text = _read_text_or_empty(root / "app" / "tree" / "[slug]" / "media" / "page.tsx")
    settings_page_text = _read_text_or_empty(root / "app" / "tree" / "[slug]" / "settings" / "page.tsx")
    start_command_text = _read_text_or_empty(root / ".codex" / "commands" / "start.sh")

    has_native_first_admin_rest = all(
        marker in admin_rest_text
        for marker in (
            "SUPABASE_ADMIN_REST_TRANSPORT",
            "runNativeAdminRestRequests",
            "runPowerShellAdminRestRequests",
            "getAdminRestTransportMode",
        )
    ) and "powerShellFetch" in server_fetch_text

    has_specialized_tree_page_loaders = all(
        marker in repository_text
        for marker in (
            "getTreeAuditPageContext",
            "getTreeMembersPageData",
            "getTreeMediaPageData",
            "getTreeSettingsPageData",
        )
    ) and all(
        marker in page_text
        for marker, page_text in (
            ("getTreeAuditPageContext", audit_page_text),
            ("getTreeMembersPageData", members_page_text),
            ("getTreeMediaPageData", media_page_text),
            ("getTreeSettingsPageData", settings_page_text),
        )
    )

    has_bash_runtime_dependency = "bash .codex/commands/start.sh" in start_command_text or bool(start_command_text)

    return {
        "has_native_first_admin_rest": has_native_first_admin_rest,
        "has_specialized_tree_page_loaders": has_specialized_tree_page_loaders,
        "has_bash_runtime_dependency": has_bash_runtime_dependency,
    }


def _collect_framework_rule_markers(root: Path, limit: int = 24) -> List[str]:
    search_roots = [
        root / "app",
        root / "components",
        root / "lib",
        root / "src",
        root / "scripts",
        root / ".codex",
    ]
    allowed_suffixes = {".py", ".ts", ".tsx", ".js", ".mjs", ".md", ".sh", ".json"}
    discovered: List[str] = []

    for base in search_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in allowed_suffixes:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for raw_line in text.splitlines():
                if FRAMEWORK_RULE_PREFIX not in raw_line:
                    continue
                rule = raw_line.split(FRAMEWORK_RULE_PREFIX, 1)[1].strip()
                if rule and rule not in discovered:
                    discovered.append(rule)
                if len(discovered) >= limit:
                    return discovered

    return discovered


def _build_antigravity_runtime_rules_section(runtime_rules: Dict[str, bool], explicit_rules: Optional[List[str]] = None) -> str:
    lines: List[str] = []

    if runtime_rules.get("has_native_first_admin_rest"):
        lines.append(
            "- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override."
        )

    if runtime_rules.get("has_specialized_tree_page_loaders"):
        lines.append(
            "- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs."
        )

    if runtime_rules.get("has_bash_runtime_dependency"):
        lines.append(
            "- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub."
        )

    for rule in explicit_rules or []:
        bullet = f"- {rule}"
        if bullet not in lines:
            lines.append(bullet)

    if not lines:
        lines.append("- No non-obvious Antigravity runtime rules were inferred automatically.")

    return "\n".join(lines)


def _build_antigravity_active_task_section(
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
) -> str:
    if not active_tasks:
        lines = ["- No active task capsule detected under `tasks/active/`."]
    else:
        lines = [
            f"- `{item['path']}` — `{item['title']}` (`{item['status']}`, priority `{item['priority']}`)"
            for item in active_tasks[:3]
        ]

    if smoke_report.get("exists"):
        outcome = "green" if smoke_report.get("ok") else "failed"
        lines.append(f"- Latest `smoke:media`: `{smoke_report.get('name')}` (`{outcome}`)")

    return "\n".join(lines)


def _build_antigravity_completion_capture(
    status: Dict[str, bool],
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
) -> str:
    lines: List[str] = []

    if active_tasks:
        primary = active_tasks[0]
        lines.append(
            f"- Primary captured workstream: `{primary['title']}` from `{primary['path']}` (`{primary['status']}`)."
        )

    if status.get("has_archive_foundation"):
        lines.append(
            "- Detected foundation: tree-level `Медиа` route, archive client, archive upload endpoints, and persisted album model are present in the worktree."
        )
    elif status.get("has_archive_surface"):
        lines.append("- Detected partial archive work: the tree-level archive surface exists, but backend or persistence wiring is incomplete.")

    if status.get("has_archive_upload_review"):
        lines.append("- Detected archive upload review flow with pending batch state and discard confirmation.")

    if status.get("has_variant_delivery"):
        lines.append("- Detected variant-aware media delivery foundation for photo previews (`thumb/small/medium`).")

    if status.get("has_cloudflare_foundation"):
        lines.append("- Detected Cloudflare R2 foundation in env/runtime config and supporting project files.")

    if smoke_report.get("exists"):
        if smoke_report.get("ok"):
            lines.append(f"- Latest `smoke:media` artifact `{smoke_report.get('name')}` is green.")
        else:
            error_summary = smoke_report.get("error_summary") or "failure details unavailable"
            lines.append(f"- Latest `smoke:media` artifact `{smoke_report.get('name')}` failed: `{error_summary}`.")
    else:
        lines.append("- No `smoke:media` artifact was found during completion capture.")

    if not lines:
        lines.append("- No high-signal Antigravity-specific completion capture could be inferred.")

    return "\n".join(lines)


def _build_antigravity_snapshot_sections(
    branch: str,
    status: Dict[str, bool],
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
    runtime_rules: Dict[str, bool],
    explicit_rules: Optional[List[str]] = None,
) -> Dict[str, str]:
    if (
        status.get("has_archive_foundation")
        and status.get("has_variant_delivery")
        and status.get("has_cloudflare_foundation")
        and smoke_report.get("ok")
    ):
        current_workstream = (
            "family archive foundation, uploader/manual albums, variant-aware media delivery, and Cloudflare R2 groundwork are already in the worktree; current effort should now shift to archive/viewer polishing, broader QA, and migration sequencing"
        )
    elif status.get("has_archive_foundation") and status.get("has_variant_delivery") and status.get("has_cloudflare_foundation"):
        current_workstream = (
            "family archive foundation, uploader/manual albums, variant-aware media delivery, and Cloudflare R2 groundwork are already in the worktree; current effort should focus on stabilizing `smoke:media` and finishing archive/viewer QA"
        )
    elif status.get("upload_flow_complete") and status.get("has_media_gallery"):
        current_workstream = (
            "media upload and in-app viewing are largely stabilized; next media steps are Cloudflare migration planning, family archive design, thumbnail variants, and builder/members QA"
        )
    else:
        current_workstream = "media upload redesign v2, thumbnail planning, tree canvas polish, and builder/members stabilization"

    current_state = "\n".join(
        [
            "- Framework mode: active",
            f"- Active branch: `{branch}`",
            "- Runtime application: `Next.js 16 + React 19 + TypeScript`",
            "- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage",
            "- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`",
            "- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime",
            f"- Current workstream: {current_workstream}",
            "- Target media platform: `Cloudflare` for the next binary/media delivery stage, while the current Yandex path remains transitional compatibility.",
        ]
    )

    blockers: List[str] = []
    if not status.get("upload_flow_complete"):
        blockers.append(
            "- [ ] Current media upload UX is still not archive-ready: single flow, multi-file batches, device video, limits and progress need to be confirmed end-to-end."
        )
    if status.get("has_cloudflare_foundation"):
        blockers.append("- [ ] Cloudflare target foundations exist in code/env, but the actual migration away from the transitional Yandex path is still incomplete.")
    else:
        blockers.append("- [ ] The media platform still needs a concrete migration from the transitional Yandex path to the target Cloudflare stack.")
    if status.get("has_variant_delivery"):
        blockers.append("- [ ] Preview variant foundations exist, but rollout and QA are still incomplete; originals should not leak back into archive/viewer/builder previews.")
    else:
        blockers.append("- [ ] Preview architecture still lacks thumbnail variants, so originals remain too heavy for large family archives.")
    if status.get("has_archive_foundation"):
        blockers.append("- [ ] The tree-level family archive foundation exists, but sticky actions, large viewer/lightbox flow, and broader end-to-end QA are still unfinished.")
    else:
        blockers.append("- [ ] The product still lacks a tree-level family archive for shared photos/videos that are not linked to one person yet.")
    if status.get("has_archive_viewer") and status.get("has_archive_sticky_actions"):
        blockers = [
            blocker
            for blocker in blockers
            if blocker != "- [ ] The tree-level family archive foundation exists, but sticky actions, large viewer/lightbox flow, and broader end-to-end QA are still unfinished."
        ]
        blockers.append("- [ ] The tree-level family archive now has sticky actions and a large viewer/lightbox, but broader album/mobile/end-to-end QA is still unfinished.")
    if smoke_report.get("exists") and not smoke_report.get("ok"):
        error_summary = smoke_report.get("error_summary") or "latest smoke failure needs manual inspection"
        blockers.append(f"- [ ] `smoke:media` is not green yet; latest artifact failed at `{error_summary}`.")
    blockers.extend(
        [
            "- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.",
            "- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.",
            "- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.",
            "- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.",
        ]
    )

    focus: List[str] = [
        "- [x] Unified local-file upload now covers photos and videos from device in one flow.",
        "- [x] Multi-file batches, visible limits copy, and human-readable progress feedback are in place in the builder.",
        "- [x] Viewer and builder now expose an in-app media gallery with inline playback for file-backed video.",
        "- [x] `smoke:media` now persists a JSON report artifact in `tests/artifacts/`.",
    ]
    if not status.get("has_media_gallery"):
        focus.insert(
            2,
            "- [ ] Add an in-app media gallery so uploaded photos and videos can be viewed without leaving the product.",
        )
    if status.get("has_archive_foundation"):
        focus.append("- [x] Tree-level `/tree/[slug]/media` archive foundation is in place with navigation, page shell, and archive client.")
    else:
        focus.append("- [ ] Add a tree-level `Медиа` section for family archive items that are not attached to a person yet.")
    if status.get("has_album_support"):
        focus.append("- [x] Archive album persistence exists for manual albums and uploader albums.")
    if status.get("has_archive_upload_review"):
        focus.append("- [x] Archive upload review flow exists with batch confirmation and discard guard.")
    if status.get("has_archive_viewer") and status.get("has_archive_sticky_actions"):
        focus.append("- [x] Archive surface now includes a large in-app viewer/lightbox and sticky bottom actions for the current context.")
    if status.get("has_variant_delivery"):
        focus.append("- [x] Variant-aware media delivery foundation exists for `thumb/small/medium` photo previews.")
    else:
        focus.append("- [ ] Add thumbnail variants (`thumb/small/medium`) so previews stop loading originals by default.")
    if status.get("has_cloudflare_foundation"):
        focus.append("- [x] Cloudflare R2 runtime/config foundation is present for the next media storage stage.")
    else:
        focus.append("- [ ] Lock the target Cloudflare migration path (`R2` / `Stream` / `Queues`) before deeper media UI work.")
    if smoke_report.get("exists") and not smoke_report.get("ok"):
        focus.append("- [ ] Stabilize `smoke:media` end-to-end across builder upload, completion, snapshot reload, and viewer rendering.")
    focus.extend(
        [
            "- [ ] Finish the current `family-tree-canvas` interaction and visual pass.",
            "- [ ] Validate `Участники`, invites and share links as one coherent access-management flow.",
            "- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.",
            "- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.",
        ]
    )

    next_steps: List[str] = []
    if status.get("has_cloudflare_foundation"):
        next_steps.append("- [ ] Convert the Cloudflare target into an explicit migration sequence: rollout gating, direct upload, Stream, and Queues.")
    else:
        next_steps.append("- [ ] Record Cloudflare as the target media platform in project docs and convert that decision into a migration sequence.")
    if status.get("has_archive_foundation"):
        next_steps.append("- [ ] Finish the archive surface with sticky actions, large viewer/lightbox behavior, and broader album flow QA.")
    else:
        next_steps.append("- [ ] Define the family archive surface (`/tree/[slug]/media`) for shared photos/videos not linked to one person.")
    if status.get("has_archive_viewer") and status.get("has_archive_sticky_actions"):
        next_steps = [
            step
            for step in next_steps
            if step != "- [ ] Finish the archive surface with sticky actions, large viewer/lightbox behavior, and broader album flow QA."
        ]
        next_steps.insert(1, "- [ ] Finish archive album/mobile QA now that sticky actions and the large viewer/lightbox are in place.")
    if status.get("has_variant_delivery"):
        next_steps.append("- [ ] Switch tree cards, side rails, archive tiles, and media galleries to preview variants by default and confirm legacy fallbacks.")
    else:
        next_steps.append("- [ ] Implement variant-aware media delivery for `thumb/small/medium`, keeping originals only for explicit full view.")
    next_steps.extend(
        [
            "- [ ] Run targeted QA for viewer, builder and members after the current media UI pass.",
            "- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.",
            "- [ ] Revisit landing and dashboard only after tree/member workflows are stable.",
            "- [ ] Close each concrete work cycle with `/fi`; completion now needs to keep manual memory sections current as well.",
        ]
    )

    return {
        "Current State": current_state,
        "Current Active Task": _build_antigravity_active_task_section(active_tasks, smoke_report),
        "Completion Capture": _build_antigravity_completion_capture(status, active_tasks, smoke_report),
        "Runtime Rules": _build_antigravity_runtime_rules_section(runtime_rules, explicit_rules),
        "Active Blockers": "\n".join(blockers),
        "Current Focus": "\n".join(focus),
        "Next Steps": "\n".join(next_steps),
    }


def _build_antigravity_backlog_active_sprint(
    status: Dict[str, bool],
    smoke_report: Optional[Dict[str, object]] = None,
) -> str:
    high_priority = [
        "- [ ] Довести текущий media UX pass: спокойнее copy, чище empty states, понятнее gallery/viewer в builder и viewer.",
        "- [ ] Завершить текущий pass по `family-tree-canvas`: age-aware avatars, fallback badge states, читаемость карточек и стабильное выделение выбранного узла в viewer и builder.",
        "- [ ] Стабилизировать layout конструктора: resizable canvas shell, overlay inspector на desktop и предсказуемое поведение на tablet/mobile без потери приоритета дерева.",
        "- [ ] Довести экран `Участники`: приглашения по аккаунту и read-only share links должны быть самодостаточными, с понятными подсказками, копированием ссылок и безопасным отзывом доступа.",
        "- [ ] Провести целевой QA для builder/viewer/members, чтобы не было регрессий в партнерах, родителях, действиях над узлами и режимах доступа.",
        "- [ ] Держать startup context, task capsules и memory-файлы актуальными: `.claude/BACKLOG.md` и `.claude/SNAPSHOT.md` должны отражать реальный workstream текущего цикла.",
    ]
    if status.get("has_cloudflare_foundation"):
        high_priority.insert(
            0,
            "- [ ] Дожать Cloudflare migration plan поверх уже добавленного R2 foundation: rollout, direct upload, `Stream` для видео и `Queues` для async jobs.",
        )
    else:
        high_priority.insert(
            0,
            "- [ ] Зафиксировать `Cloudflare` как целевую media-platform и пройти migration plan: `R2` для файлов, `Stream` для видео, `Queues` для async jobs.",
        )
    if status.get("has_archive_foundation"):
        high_priority.insert(
            1,
            "- [ ] Довести уже созданный tree-level раздел `Медиа`: sticky actions, большой viewer/lightbox, upload/album QA и спокойные empty states.",
        )
    else:
        high_priority.insert(
            1,
            "- [ ] Добавить tree-level раздел `Медиа` как семейный архив для фото и видео без привязки к одному человеку.",
        )
    if status.get("has_variant_delivery"):
        high_priority.insert(
            2,
            "- [ ] Довести variant architecture до green regression: `thumb/small/medium` должны стабильно использоваться в archive/viewer/builder, а оригинал открываться только явно.",
        )
    else:
        high_priority.insert(
            2,
            "- [ ] Завершить media stream через thumbnail/variant architecture: `thumb/small/medium` для preview, оригинал только для full view.",
        )
    if not status.get("upload_flow_complete"):
        high_priority.insert(
            0,
            "- [ ] Подтвердить, что единый upload для фото и видео с устройства, multi-file, progress и limits copy работают без остаточных регрессий.",
        )
    if smoke_report and smoke_report.get("exists") and not smoke_report.get("ok"):
        error_summary = smoke_report.get("error_summary") or "нужна ручная диагностика"
        high_priority.insert(0, f"- [ ] Починить `smoke:media`: последний артефакт упал на `{error_summary}`.")

    medium_priority = [
        "- [ ] Вернуться к calm pass для landing и dashboard после стабилизации builder/members: сократить лишний copy, выровнять ритм заголовков и CTA.",
        "- [ ] Добить единый light visual system для `Настройки`, `Журнал`, `Участники`, builder и viewer.",
        "- [ ] Проверить аватары и карточки дерева на кейсах без фото, с кириллицей в gender, с детьми и пожилыми, чтобы визуальные fallback-и были предсказуемыми.",
        "- [ ] Уточнить, какие из новых проектных документов должны оставаться обязательным startup context, а какие достаточно держать как справочные.",
        "- [ ] Подготовить следующий smoke cycle после текущих UI правок и обновления memory-файлов.",
    ]

    low_priority = [
        "- [ ] Добавлять motion-акценты только после стабилизации canvas/layout/access flows.",
        "- [ ] Возвращаться к бренд-деталям landing только если это не конфликтует с коротким utilitarian тоном продукта.",
    ]

    return (
        "### High Priority\n\n"
        f"{_build_markdown_lines(high_priority)}\n\n"
        "### Medium Priority\n\n"
        f"{_build_markdown_lines(medium_priority)}\n\n"
        "### Low Priority\n\n"
        f"{_build_markdown_lines(low_priority)}"
    )


def _build_antigravity_architecture_section(
    status: Dict[str, bool],
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
    runtime_rules: Dict[str, bool],
    explicit_rules: Optional[List[str]] = None,
) -> str:
    lines: List[str] = []

    if status.get("has_archive_foundation"):
        lines.append(
            "- Person-linked media and tree-level archive now coexist: the worktree contains `/tree/[slug]/media`, archive client UI, archive upload endpoints, and persisted album wiring."
        )
    else:
        lines.append(
            "- Person-linked media remains the primary implemented surface; tree-level archive work is not yet fully wired end-to-end."
        )

    if status.get("has_album_support"):
        lines.append(
            "- Archive organization is modeled through `tree_media_albums` and album items, with both manual albums and uploader albums supported."
        )
    if status.get("has_archive_viewer") and status.get("has_archive_sticky_actions"):
        lines.append(
            "- The archive read surface now includes a large in-app viewer/lightbox and sticky footer actions, so gallery browsing no longer depends on narrow cards or external tab jumps."
        )

    if status.get("has_variant_delivery"):
        lines.append(
            "- Photo delivery already has a variant-aware foundation: preview reads may use `thumb/small/medium`, while originals should remain an explicit full-view path."
        )
    else:
        lines.append(
            "- Photo delivery is still effectively original-first; variant rollout is not yet captured as active runtime architecture."
        )

    if status.get("has_cloudflare_foundation"):
        lines.append(
            "- The binary plane is in transitional mode: current file-backed reads still preserve object-storage compatibility, while Cloudflare R2 foundation is already present in env/runtime config for the next migration stage."
        )
    else:
        lines.append(
            "- The binary plane is still centered on the current object-storage path; Cloudflare migration groundwork is not yet visible in runtime config."
        )

    lines.append(
        "- Architectural boundary remains unchanged: `app/api/media*` stays thin, repository owns media/archive mutations, and rendering consumes repository snapshots rather than issuing direct DB traversal."
    )

    if active_tasks:
        primary = active_tasks[0]
        lines.append(
            f"- Active architecture-driving task: `{primary['title']}` from `{primary['path']}` (`{primary['status']}`)."
        )

    if smoke_report.get("exists"):
        if smoke_report.get("ok"):
            lines.append(
                f"- Current regression signal: latest `smoke:media` artifact `{smoke_report.get('name')}` is green."
            )
        else:
            error_summary = smoke_report.get("error_summary") or "failure details unavailable"
            lines.append(
                f"- Current regression signal: latest `smoke:media` artifact `{smoke_report.get('name')}` failed at `{error_summary}`."
            )

    if runtime_rules.get("has_native_first_admin_rest"):
        lines.append(
            "- Server-side Supabase transport is now a first-class runtime rule: native Node fetch is preferred, while the PowerShell bridge remains fallback/debug transport only."
        )

    if runtime_rules.get("has_specialized_tree_page_loaders"):
        lines.append(
            "- Tree runtime now distinguishes between full snapshot consumers and narrow page-data consumers; `audit`, `members`, `media`, and `settings` should stay on specialized loaders instead of drifting back to full snapshots."
        )

    for rule in explicit_rules or []:
        bullet = f"- {rule}"
        if bullet not in lines:
            lines.append(bullet)

    return "\n".join(lines)


def _build_antigravity_execution_order() -> str:
    steps = [
        "1. Verify gated `Cloudflare R2` readiness: `CF_R2_*`, bucket CORS, upload-intent metadata, `smoke:media`, and `smoke:media:direct`.",
        "2. Activate rollout and confirm `resolvedUploadBackend=cloudflare_r2` for new uploads.",
        "3. Run post-activation regression for archive/viewer/builder/members, preview variants, and legacy Yandex-backed reads.",
        "4. Run live UAT for owner `EU`, helper `RF`, and read-only relative `RF`.",
        "5. Complete backup/restore rehearsal and the final launch checklist before release decision.",
    ]
    return "\n".join(steps)


def _build_antigravity_validation_baseline(smoke_report: Dict[str, object]) -> List[str]:
    lines = [
        "- `.claude/*` files are auto-synced during `completion`; this is the canonical automatic state path.",
        "- `README.md`, operational docs, and the main `Slava edition` plan docs reflect current runtime/launch state only if completion owns an explicit sync path for them; operational docs and plan docs are now covered by that sync.",
    ]
    if smoke_report.get("exists"):
        if smoke_report.get("ok"):
            lines.append(f"- Latest `smoke:media` artifact `{smoke_report.get('name')}` is green.")
        else:
            error_summary = smoke_report.get("error_summary") or "latest failure needs manual inspection"
            lines.append(f"- Latest `smoke:media` artifact `{smoke_report.get('name')}` failed at `{error_summary}`.")
    else:
        lines.append("- No `smoke:media` artifact was detected during the latest completion sync.")
    lines.append("- Broad `smoke:e2e` still needs a clean confirmation cycle in the current environment.")
    return lines


def _build_antigravity_current_launch_gaps(status: Dict[str, bool], smoke_report: Dict[str, object]) -> List[str]:
    lines = [
        "- Mandatory `Cloudflare R2` rollout still needs gated verification, activation, and post-activation close-out.",
        "- Live `EU + RF` UAT is still a launch gate.",
        "- Backup/restore rehearsal and final launch checklist remain part of release readiness.",
    ]
    if status.get("has_archive_foundation"):
        lines.append("- Archive/viewer/builder/members regression after rollout activation still needs explicit close-out.")
    else:
        lines.append("- Tree-level archive foundation is still incomplete and remains launch-relevant.")
    if status.get("has_variant_delivery"):
        lines.append("- Preview-variant rollout still needs regression confirmation across archive/viewer/builder.")
    else:
        lines.append("- Preview variants are still incomplete for launch-scale media browsing.")
    if smoke_report.get("exists") and not smoke_report.get("ok"):
        error_summary = smoke_report.get("error_summary") or "latest failure needs manual inspection"
        lines.append(f"- Latest `smoke:media` artifact is red at `{error_summary}`.")
    return lines


def _build_antigravity_owner_playbook_sync_block(
    timestamp_utc: str,
    status: Dict[str, bool],
    smoke_report: Dict[str, object],
) -> str:
    lines = [
        "## Current Operational Sync",
        "",
        f"- Updated at (UTC): `{timestamp_utc}`",
        "- Current launch rule: `Cloudflare R2` rollout is mandatory for `Slava edition`; legacy Yandex-backed media remains compatibility/read path only until migration is closed.",
    ]
    if status.get("has_person_media_tab_split"):
        lines.extend(
            [
                "- Current person-media UI:",
                "  - `Инфо` for person data and documents",
                "  - `Фото` for photo gallery/upload",
                "  - `Видео` for video gallery/upload",
            ]
        )
    if status.get("has_archive_foundation"):
        lines.extend(
            [
                "- Current shared-media UI:",
                "  - tree-level `Медиа` is the family archive for shared materials",
                "  - archive upload uses review/confirm before save",
            ]
        )
    if status.get("has_person_upload_review"):
        lines.append("- Person media upload now uses a review/confirm step before final save.")
    lines.extend(
        [
            "- Current execution order:",
            _build_antigravity_execution_order(),
            "",
            "### Validation Baseline",
            "",
            *_build_antigravity_validation_baseline(smoke_report),
        ]
    )
    return "\n".join(lines)


def _build_antigravity_launch_checklist_sync_block(
    timestamp_utc: str,
    smoke_report: Dict[str, object],
) -> str:
    lines = [
        "## Current Launch Sync",
        "",
        f"- Updated at (UTC): `{timestamp_utc}`",
        "- Launch is currently blocked until `Cloudflare R2` rollout is activated and confirmed as the steady-state upload path.",
        "- Current execution order:",
        _build_antigravity_execution_order(),
        "",
        "### Current Validation Signal",
        "",
        *_build_antigravity_validation_baseline(smoke_report),
    ]
    return "\n".join(lines)


def _build_antigravity_backup_runbook_sync_block(
    timestamp_utc: str,
    status: Dict[str, bool],
) -> str:
    lines = [
        "## Current Recovery Sync",
        "",
        f"- Updated at (UTC): `{timestamp_utc}`",
        "- Active binary-plane assumptions:",
        "  - new uploads must move to `Cloudflare R2` before release",
        "  - legacy Yandex-backed media must remain readable until migration is explicitly closed",
        "- Before any risky rollout step, capture a fresh backup before changing `CF_R2_ROLLOUT_AT`, storage policy, or bucket CORS.",
        "- Restore rehearsal must verify both the active `Cloudflare R2` path and any still-readable legacy compatibility path.",
    ]
    if status.get("has_cloudflare_foundation"):
        lines.append("- Runtime/config already exposes the `Cloudflare R2` foundation; backup notes must therefore track rollout state as operational data.")
    return "\n".join(lines)


def _build_antigravity_plan_sync_block(
    timestamp_utc: str,
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
) -> str:
    lines: List[str] = [
        "## Current Plan Sync",
        "",
        f"- Updated at (UTC): `{timestamp_utc}`",
        "- This document remains the long-lived product frame; the current execution order below is the active launch path.",
        "- Current launch rule: `Cloudflare R2` rollout is mandatory for `Slava edition` release readiness.",
    ]
    if active_tasks:
        primary = active_tasks[0]
        lines.append(
            f"- Current primary workstream: `{primary['title']}` from `{primary['path']}` (`{primary['status']}`)."
        )
    lines.extend(
        [
            "- Current execution order:",
            _build_antigravity_execution_order(),
            "",
            "### Validation Baseline",
            "",
            *_build_antigravity_validation_baseline(smoke_report),
        ]
    )
    return "\n".join(lines)


def _build_antigravity_implementation_sync_block(
    timestamp_utc: str,
    status: Dict[str, bool],
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
) -> str:
    lines: List[str] = [
        "## Current Implementation Sync",
        "",
        f"- Updated at (UTC): `{timestamp_utc}`",
        "- Workstreams `A-D` are largely materialized in the repo; the active launch-critical sequence is now rollout + regression + UAT + recovery rehearsal.",
    ]
    if active_tasks:
        primary = active_tasks[0]
        lines.append(
            f"- Active implementation stream: `{primary['title']}` from `{primary['path']}` (`{primary['status']}`)."
        )
    if status.get("has_archive_foundation"):
        lines.append("- Tree-level archive foundation is present in the repo.")
    if status.get("has_variant_delivery"):
        lines.append("- Preview-variant delivery foundation is present in the repo.")
    if status.get("has_cloudflare_foundation"):
        lines.append("- `Cloudflare R2` rollout foundation is present in env/runtime config and smoke coverage.")
    lines.extend(
        [
            "",
            "### Current Launch Gaps",
            "",
            *_build_antigravity_current_launch_gaps(status, smoke_report),
            "",
            "### Current Execution Order",
            "",
            _build_antigravity_execution_order(),
        ]
    )
    return "\n".join(lines)


def _build_antigravity_engineering_backlog_sync_block(
    timestamp_utc: str,
    status: Dict[str, bool],
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
) -> str:
    lines: List[str] = [
        "## Current Engineering Sync",
        "",
        f"- Updated at (UTC): `{timestamp_utc}`",
        "- Treat the historical phases below as reference coverage. The launch order in this sync block is the current engineering queue.",
    ]
    if active_tasks:
        primary = active_tasks[0]
        lines.append(
            f"- Active engineering stream: `{primary['title']}` from `{primary['path']}` (`{primary['status']}`)."
        )
    lines.extend(
        [
            "",
            "### Current P0 Launch Order",
            "",
            _build_antigravity_execution_order(),
            "",
            "### Current P0 Gaps",
            "",
            *_build_antigravity_current_launch_gaps(status, smoke_report),
            "",
            "### Current Validation Baseline",
            "",
            *_build_antigravity_validation_baseline(smoke_report),
        ]
    )
    return "\n".join(lines)


def _sync_antigravity_operational_docs(
    root: Path,
    timestamp_utc: str,
    status: Dict[str, bool],
    smoke_report: Dict[str, object],
) -> List[str]:
    updated_files: List[str] = []
    targets = [
        (
            root / ANTIGRAVITY_OWNER_PLAYBOOK_PATH,
            "FRAMEWORK:PLAYBOOK",
            _build_antigravity_owner_playbook_sync_block(timestamp_utc, status, smoke_report),
        ),
        (
            root / ANTIGRAVITY_LAUNCH_CHECKLIST_PATH,
            "FRAMEWORK:LAUNCH",
            _build_antigravity_launch_checklist_sync_block(timestamp_utc, smoke_report),
        ),
        (
            root / ANTIGRAVITY_BACKUP_RUNBOOK_PATH,
            "FRAMEWORK:RECOVERY",
            _build_antigravity_backup_runbook_sync_block(timestamp_utc, status),
        ),
    ]

    for path, marker_id, content in targets:
        if not path.exists():
            continue
        if _upsert_marked_block_after_title(path, marker_id, content):
            updated_files.append(path.as_posix())

    return updated_files


def _sync_antigravity_plan_docs(
    root: Path,
    timestamp_utc: str,
    status: Dict[str, bool],
    active_tasks: List[Dict[str, str]],
    smoke_report: Dict[str, object],
) -> List[str]:
    updated_files: List[str] = []
    targets = [
        (
            root / ANTIGRAVITY_PLAN_DOC_PATH,
            "FRAMEWORK:PLAN",
            _build_antigravity_plan_sync_block(timestamp_utc, active_tasks, smoke_report),
        ),
        (
            root / ANTIGRAVITY_IMPLEMENTATION_PLAN_PATH,
            "FRAMEWORK:IMPLEMENTATION",
            _build_antigravity_implementation_sync_block(timestamp_utc, status, active_tasks, smoke_report),
        ),
        (
            root / ANTIGRAVITY_ENGINEERING_BACKLOG_PATH,
            "FRAMEWORK:ENGINEERING",
            _build_antigravity_engineering_backlog_sync_block(timestamp_utc, status, active_tasks, smoke_report),
        ),
    ]

    for path, marker_id, content in targets:
        if not path.exists():
            continue
        if _upsert_marked_block_after_title(path, marker_id, content):
            updated_files.append(path.as_posix())

    return updated_files


def _sync_antigravity_manual_memory(root: Path, timestamp_utc: str, branch: str) -> List[str]:
    if not _is_antigravity_repo(root):
        return []

    status = _detect_antigravity_media_status(root)
    runtime_rules = _detect_antigravity_runtime_rules(root)
    explicit_rules = _collect_framework_rule_markers(root)
    active_tasks = _load_active_task_capsules(root)
    smoke_report = _load_latest_media_smoke_report(root)
    date_label = timestamp_utc.split(" ")[0]
    updated_files: List[str] = []

    snapshot_path = root / ".claude" / "SNAPSHOT.md"
    snapshot_content = _read_text_or_empty(snapshot_path)
    snapshot_sections = _build_antigravity_snapshot_sections(branch, status, active_tasks, smoke_report, runtime_rules, explicit_rules)
    next_snapshot = snapshot_content
    next_snapshot, _ = _replace_line(next_snapshot, r"^\*Last updated: .*?\*$", f"*Last updated: {date_label}*")
    for heading, body in snapshot_sections.items():
        next_snapshot, _ = _replace_top_level_section(next_snapshot, heading, body)
    if _write_if_changed(snapshot_path, next_snapshot, snapshot_content):
        updated_files.append(snapshot_path.as_posix())

    backlog_path = root / ".claude" / "BACKLOG.md"
    backlog_content = _read_text_or_empty(backlog_path)
    next_backlog = backlog_content
    next_backlog, _ = _replace_line(next_backlog, r"^\*Updated: .*?\*$", f"*Updated: {date_label}*")
    next_backlog, _ = _replace_top_level_section(
        next_backlog,
        "Active Sprint",
        _build_antigravity_backlog_active_sprint(status, smoke_report),
    )
    if _write_if_changed(backlog_path, next_backlog, backlog_content):
        updated_files.append(backlog_path.as_posix())

    architecture_path = root / ".claude" / "ARCHITECTURE.md"
    if architecture_path.exists():
        architecture_content = _read_text_or_empty(architecture_path)
        next_architecture = architecture_content
        next_architecture, _ = _replace_top_level_section(
            next_architecture,
            "Current Media Architecture",
            _build_antigravity_architecture_section(status, active_tasks, smoke_report, runtime_rules, explicit_rules),
        )
        next_architecture, _ = _replace_top_level_section(
            next_architecture,
            "Current Runtime Rules",
            _build_antigravity_runtime_rules_section(runtime_rules, explicit_rules),
        )
        if _write_if_changed(architecture_path, next_architecture, architecture_content):
            updated_files.append(architecture_path.as_posix())

    operational_updates = _sync_antigravity_operational_docs(root, timestamp_utc, status, smoke_report)
    if operational_updates:
        updated_files.extend(operational_updates)

    plan_updates = _sync_antigravity_plan_docs(root, timestamp_utc, status, active_tasks, smoke_report)
    if plan_updates:
        updated_files.extend(plan_updates)

    return updated_files


def _read_package_manifest(root: Path) -> Dict[str, object]:
    package_path = root / "package.json"
    if not package_path.exists():
        return {}
    try:
        with open(package_path, encoding="utf-8") as file_handle:
            payload = json.load(file_handle)
        if isinstance(payload, dict):
            return payload
    except Exception:
        logging.exception("memory_sync: failed to read package.json")
    return {}


def _package_version(manifest: Dict[str, object], package_name: str) -> Optional[str]:
    for key in ("dependencies", "devDependencies", "peerDependencies"):
        block = manifest.get(key)
        if not isinstance(block, dict):
            continue
        value = block.get(package_name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _format_package_version(raw_version: Optional[str]) -> Optional[str]:
    if not raw_version:
        return None
    cleaned = raw_version.strip()
    while cleaned and cleaned[0] in "^~<>= ":
        cleaned = cleaned[1:]
    return cleaned or raw_version


def _build_architecture_state_block(root: Path, timestamp_utc: str) -> str:
    manifest = _read_package_manifest(root)
    next_version = _format_package_version(_package_version(manifest, "next"))
    react_version = _format_package_version(_package_version(manifest, "react"))
    typescript_version = _format_package_version(_package_version(manifest, "typescript"))
    has_supabase = bool(root.joinpath("supabase").exists()) or any(
        _package_version(manifest, package_name)
        for package_name in ("@supabase/supabase-js", "@supabase/ssr", "supabase")
    )
    has_app_router = root.joinpath("app").exists()
    has_components = root.joinpath("components").exists()
    has_lib = root.joinpath("lib").exists()
    has_tests = root.joinpath("tests").exists()
    has_legacy = any(
        root.joinpath(path_name).exists()
        for path_name in ("legacy", "index.html", "css", "js")
    )

    if has_app_router and next_version:
        primary_runtime = "Next.js App Router web application"
    elif has_app_router:
        primary_runtime = "App Router web application"
    elif root.joinpath("index.html").exists():
        primary_runtime = "Static browser viewer"
    else:
        primary_runtime = "Runtime requires manual confirmation"

    stack_parts: List[str] = []
    if next_version:
        stack_parts.append(f"Next.js {next_version}")
    if react_version:
        stack_parts.append(f"React {react_version}")
    if typescript_version or root.joinpath("tsconfig.json").exists():
        stack_parts.append("TypeScript")
    if has_supabase:
        stack_parts.append("Supabase")
    application_stack = " + ".join(stack_parts) if stack_parts else "Stack requires manual confirmation"

    boundary_lines: List[str] = []
    if has_app_router:
        boundary_lines.append("- `app/` - App Router pages, auth flows, dashboard, tree routes, and route handlers.")
    if has_components:
        boundary_lines.append("- `components/` - UI components for builder, viewer, settings, members, and auth.")
    if has_lib:
        boundary_lines.append("- `lib/` - shared server logic, permissions, validators, tree/media helpers, and Supabase clients.")
    if has_supabase:
        boundary_lines.append("- `supabase/` - schema migrations, seed data, and local Supabase configuration.")
    if has_tests:
        boundary_lines.append("- `tests/` - unit, smoke, and e2e coverage for product flows.")
    if has_legacy:
        boundary_lines.append("- `legacy/` plus top-level `index.html`/`css/`/`js/` - preserved static viewer artifacts, not the primary runtime.")

    notes: List[str] = []
    if has_app_router and has_legacy:
        notes.append("- The checked-out repository contains the live Next.js/Supabase product and a preserved legacy viewer.")
    elif has_app_router:
        notes.append("- The checked-out repository contains the live application slice.")
    elif has_legacy:
        notes.append("- The repository still appears to be centered on a static viewer.")
    notes.append("- Treat this generated block as the current source of truth for repo shape; manual notes below should only add decisions that cannot be inferred automatically.")

    backend_value = "Supabase auth, database, RLS, and storage" if has_supabase else "Not detected"
    legacy_value = "Legacy assets preserved in `legacy/` and top-level viewer files" if has_legacy else "Not detected"

    return (
        "## Current Architecture Snapshot\n\n"
        f"- Generated at (UTC): `{timestamp_utc}`\n"
        f"- Primary runtime: `{primary_runtime}`\n"
        f"- Application stack: `{application_stack}`\n"
        f"- Backend/data layer: `{backend_value}`\n"
        f"- Legacy artifacts: {legacy_value}\n\n"
        "### Active Runtime Boundaries\n\n"
        f"{_build_markdown_lines(boundary_lines)}\n\n"
        "### Freshness Rules\n\n"
        f"{_build_markdown_lines(notes)}\n"
    )


def _build_snapshot_auto_block(
    timestamp_utc: str,
    branch: str,
    git_status_result: str,
    git_diff_result: str,
    changed_paths: List[str],
    stack: List[str],
    structure: List[str],
) -> str:
    stack_lines = [f"- {item}" for item in stack]
    changed_lines = [f"- `{item}`" for item in changed_paths]
    structure_lines = [item for item in structure]
    return (
        "## Framework Auto Sync\n\n"
        f"- Updated at (UTC): `{timestamp_utc}`\n"
        f"- Active branch: `{branch}`\n"
        f"- Git status: `{git_status_result}`\n"
        f"- Git diff: `{git_diff_result}`\n\n"
        "### Top Changed Paths\n\n"
        f"{_build_markdown_lines(changed_lines)}\n\n"
        "### Detected Stack\n\n"
        f"{_build_markdown_lines(stack_lines)}\n\n"
        "### Top-Level Structure Snapshot\n\n"
        f"{_build_markdown_lines(structure_lines)}\n"
    )


def _build_backlog_auto_block(
    timestamp_utc: str,
    branch: str,
    git_status_result: str,
    git_diff_result: str,
    changed_paths: List[str],
    stack: List[str],
    structure: List[str],
) -> str:
    changed_count = _extract_first_number(git_status_result) or 0
    diff_lines = _extract_first_number(git_diff_result) or 0
    stack_lines = [f"- {item}" for item in stack]
    structure_lines = [item for item in structure]
    focus_items = [
        f"- [ ] Review changed files summary (`{changed_count}` files, `{diff_lines}` diff lines).",
        "- [ ] Confirm manual notes in this file still match current sprint priorities.",
        "- [ ] Close stale TODOs that are no longer relevant after the latest completion.",
    ]
    changed_lines = [f"- `{item}`" for item in changed_paths]
    return (
        "## Framework Auto Sync\n\n"
        f"- Updated at (UTC): `{timestamp_utc}`\n"
        f"- Active branch: `{branch}`\n"
        f"- Git status: `{git_status_result}`\n"
        f"- Git diff: `{git_diff_result}`\n\n"
        "### Suggested Focus\n\n"
        f"{_build_markdown_lines(focus_items)}\n\n"
        "### Top Changed Paths\n\n"
        f"{_build_markdown_lines(changed_lines)}\n\n"
        "### Detected Stack\n\n"
        f"{_build_markdown_lines(stack_lines)}\n\n"
        "### Top-Level Structure Snapshot\n\n"
        f"{_build_markdown_lines(structure_lines)}\n"
    )


def _build_architecture_auto_block(
    timestamp_utc: str,
    branch: str,
    git_status_result: str,
    git_diff_result: str,
    stack: List[str],
    structure: List[str],
    changed_paths: List[str],
) -> str:
    stack_lines = [f"- {item}" for item in stack]
    changed_lines = [f"- `{item}`" for item in changed_paths]
    return (
        "## Framework Auto Sync\n\n"
        f"- Updated at (UTC): `{timestamp_utc}`\n"
        f"- Active branch: `{branch}`\n"
        f"- Git status: `{git_status_result}`\n"
        f"- Git diff: `{git_diff_result}`\n\n"
        "### Detected Stack\n\n"
        f"{_build_markdown_lines(stack_lines)}\n\n"
        "### Top-Level Structure Snapshot\n\n"
        f"{_build_markdown_lines(structure)}\n\n"
        "### Recently Changed Paths\n\n"
        f"{_build_markdown_lines(changed_lines)}\n"
    )


def _build_latest_session_block(
    timestamp_utc: str,
    branch: str,
    git_status_result: str,
    git_diff_result: str,
    task_results: Optional[List[dict]],
    changed_paths: Optional[List[str]] = None,
) -> str:
    lookup = {item.get("name"): item for item in (task_results or []) if isinstance(item, dict)}
    status_lines = []
    for task_name in KEY_SESSION_TASKS:
        item = lookup.get(task_name)
        if not item:
            status_lines.append(f"- `{task_name}`: `not_run`")
            continue
        task_status = item.get("status", "unknown")
        task_result = item.get("result", "")
        if task_result:
            status_lines.append(f"- `{task_name}`: `{task_status}` (`{task_result}`)")
        else:
            status_lines.append(f"- `{task_name}`: `{task_status}`")

    changed_count = _extract_first_number(git_status_result) or 0
    diff_count = _extract_first_number(git_diff_result) or 0
    touched = len(changed_paths or [])

    return (
        "## Latest Completion Session\n\n"
        f"- Completed at (UTC): `{timestamp_utc}`\n"
        f"- Branch: `{branch}`\n"
        f"- Git status summary: `{git_status_result}`\n"
        f"- Git diff summary: `{git_diff_result}`\n\n"
        f"- Session summary: `{changed_count}` changed files, `{diff_count}` diff lines, `{touched}` tracked changed paths.\n\n"
        "### Key Task Statuses\n\n"
        f"{_build_markdown_lines(status_lines)}\n"
    )


@time_task
def sync_shared_memory_task(
    git_status_result: str,
    git_diff_result: str,
    task_results: Optional[List[dict]] = None,
):
    """Synchronize shared memory blocks in state files on completion."""
    try:
        root = Path.cwd()
        settings = _resolve_memory_sync_config(root)

        if not settings.get("enabled", True):
            return create_task_result("memory_sync", "success", "MEMORY:skipped:disabled")
        if str(settings.get("mode", "hybrid")).strip().lower() != "hybrid":
            return create_task_result("memory_sync", "success", "MEMORY:skipped:mode")
        if str(settings.get("on_completion", "always")).strip().lower() != "always":
            return create_task_result("memory_sync", "success", "MEMORY:skipped:trigger")

        timestamp_utc = _utc_now_label()
        branch = _detect_branch(root)
        stack = _detect_stack(root)
        structure = _top_level_structure(root)
        changed_paths = _collect_changed_paths(limit=15)
        is_antigravity = _is_antigravity_repo(root)

        snapshot_auto = _build_snapshot_auto_block(
            timestamp_utc,
            branch,
            git_status_result,
            git_diff_result,
            changed_paths,
            stack,
            structure,
        )
        backlog_auto = _build_backlog_auto_block(
            timestamp_utc,
            branch,
            git_status_result,
            git_diff_result,
            changed_paths,
            stack,
            structure,
        )
        architecture_auto = _build_architecture_auto_block(
            timestamp_utc,
            branch,
            git_status_result,
            git_diff_result,
            stack,
            structure,
            changed_paths,
        )
        architecture_state = _build_architecture_state_block(root, timestamp_utc)
        session_block = _build_latest_session_block(
            timestamp_utc,
            branch,
            git_status_result,
            git_diff_result,
            task_results,
            changed_paths,
        )

        targets = {
            root / STATE_FILES[0]: snapshot_auto,
            root / STATE_FILES[1]: backlog_auto,
            root / STATE_FILES[2]: architecture_auto,
        }
        telemetry_free_paths = {root / STATE_FILES[0], root / STATE_FILES[1]} if is_antigravity else set()

        updated_paths = set()
        for path, auto_content in targets.items():
            architecture_changed = False
            auto_changed = False
            session_changed = False
            telemetry_removed = False
            if path == root / STATE_FILES[2]:
                architecture_changed = _upsert_marked_block(path, "FRAMEWORK:ARCHITECTURE", architecture_state)

            if path in telemetry_free_paths:
                telemetry_removed = _remove_marked_block(path, "FRAMEWORK:AUTO") or telemetry_removed
                telemetry_removed = _remove_marked_block(path, "FRAMEWORK:SESSION") or telemetry_removed
            else:
                auto_changed = _upsert_marked_block(path, "FRAMEWORK:AUTO", auto_content)
                session_changed = _upsert_marked_block(path, "FRAMEWORK:SESSION", session_block)

            if architecture_changed or auto_changed or session_changed or telemetry_removed:
                updated_paths.add(path.as_posix())
            logging.info(
                "memory_sync: file=%s architecture_changed=%s auto_changed=%s session_changed=%s telemetry_removed=%s",
                path.as_posix(),
                architecture_changed,
                auto_changed,
                session_changed,
                telemetry_removed,
            )

        manual_updates = _sync_antigravity_manual_memory(root, timestamp_utc, branch)
        if manual_updates:
            updated_paths.update(manual_updates)
            logging.info("memory_sync: antigravity manual sections updated files=%s", manual_updates)

        logging.info(
            "memory_sync: completed updated_files=%s branch=%s status=%s diff=%s",
            len(updated_paths),
            branch,
            git_status_result,
            git_diff_result,
        )

        return create_task_result("memory_sync", "success", f"MEMORY:updated:{len(updated_paths)}")
    except Exception as error:
        logging.exception("memory_sync: failed")
        return create_task_result("memory_sync", "error", "", error=str(error))
