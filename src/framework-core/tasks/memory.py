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


def _collect_changed_paths(limit: int = 10) -> List[str]:
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


def _build_markdown_lines(rows: Iterable[str]) -> str:
    values = [item for item in rows if item]
    return "\n".join(values) if values else "- `<none>`"


def _read_text_or_empty(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


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

    has_multi_file_upload = "MAX_MEDIA_FILES_PER_BATCH" in builder_text and "multiple" in builder_text
    has_device_video_upload = 'accept="image/*,video/*' in builder_text and "smoke-video.webm" in smoke_text
    has_limits_copy = "builder-media-limits-note" in builder_text
    has_progress_ui = "builder-media-progress-meta" in builder_text and "XMLHttpRequest" in builder_text
    has_media_gallery = (
        gallery_text != ""
        and "PersonMediaGallery" in builder_text
        and "PersonMediaGallery" in viewer_text
    )
    has_smoke_report = "media-storage-report-" in smoke_text and "fs.writeFileSync(reportPath" in smoke_text
    has_variant_delivery = (
        "variant" in media_route_text
        and any(token in media_route_text or token in display_text for token in ("thumb", "small", "medium"))
    )

    return {
        "has_multi_file_upload": has_multi_file_upload,
        "has_device_video_upload": has_device_video_upload,
        "has_limits_copy": has_limits_copy,
        "has_progress_ui": has_progress_ui,
        "has_media_gallery": has_media_gallery,
        "has_smoke_report": has_smoke_report,
        "has_variant_delivery": has_variant_delivery,
        "upload_flow_complete": all(
            (
                has_multi_file_upload,
                has_device_video_upload,
                has_limits_copy,
                has_progress_ui,
            )
        ),
    }


def _build_antigravity_snapshot_sections(branch: str, status: Dict[str, bool]) -> Dict[str, str]:
    current_workstream = (
        "media upload and in-app viewing are largely stabilized; next media step is thumbnail variants, alongside tree canvas polish and builder/members QA"
        if status.get("upload_flow_complete") and status.get("has_media_gallery")
        else "media upload redesign v2, thumbnail planning, tree canvas polish, and builder/members stabilization"
    )

    current_state = "\n".join(
        [
            "- Framework mode: active",
            f"- Active branch: `{branch}`",
            "- Runtime application: `Next.js 16 + React 19 + TypeScript`",
            "- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage",
            "- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`",
            "- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime",
            f"- Current workstream: {current_workstream}",
        ]
    )

    blockers = [
        "- [ ] Preview architecture still lacks thumbnail variants, so originals remain too heavy for large family archives.",
        "- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.",
        "- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.",
        "- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.",
        "- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.",
    ]
    if not status.get("upload_flow_complete"):
        blockers.insert(
            0,
            "- [ ] Current media upload UX is still not archive-ready: single flow, multi-file batches, device video, limits and progress need to be confirmed end-to-end.",
        )

    focus = [
        "- [x] Unified local-file upload now covers photos and videos from device in one flow.",
        "- [x] Multi-file batches, visible limits copy, and human-readable progress feedback are in place in the builder.",
        "- [x] Viewer and builder now expose an in-app media gallery with inline playback for file-backed video.",
        "- [x] `smoke:media` now persists a JSON report artifact in `tests/artifacts/`.",
        "- [ ] Add thumbnail variants (`thumb/small/medium`) so previews stop loading originals by default.",
        "- [ ] Finish the current `family-tree-canvas` interaction and visual pass.",
        "- [ ] Validate `Участники`, invites and share links as one coherent access-management flow.",
        "- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.",
        "- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.",
    ]
    if not status.get("has_media_gallery"):
        focus.insert(
            2,
            "- [ ] Add an in-app media gallery so uploaded photos and videos can be viewed without leaving the product.",
        )

    next_steps = [
        "- [ ] Implement variant-aware media delivery for `thumb/small/medium`, keeping originals only for explicit full view.",
        "- [ ] Switch tree cards, side rails and media galleries to preview variants instead of originals.",
        "- [ ] Run targeted QA for viewer, builder and members after the current media UI pass.",
        "- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.",
        "- [ ] Revisit landing and dashboard only after tree/member workflows are stable.",
        "- [ ] Close each concrete work cycle with `/fi`; completion now needs to keep manual memory sections current as well.",
    ]

    return {
        "Current State": current_state,
        "Active Blockers": "\n".join(blockers),
        "Current Focus": "\n".join(focus),
        "Next Steps": "\n".join(next_steps),
    }


def _build_antigravity_backlog_active_sprint(status: Dict[str, bool]) -> str:
    high_priority = [
        "- [ ] Завершить media stream через thumbnail/variant architecture: `thumb/small/medium` для preview, оригинал только для full view, CDN позже.",
        "- [ ] Довести текущий media UX pass: спокойнее copy, чище empty states, понятнее gallery/viewer в builder и viewer.",
        "- [ ] Завершить текущий pass по `family-tree-canvas`: age-aware avatars, fallback badge states, читаемость карточек и стабильное выделение выбранного узла в viewer и builder.",
        "- [ ] Стабилизировать layout конструктора: resizable canvas shell, overlay inspector на desktop и предсказуемое поведение на tablet/mobile без потери приоритета дерева.",
        "- [ ] Довести экран `Участники`: приглашения по аккаунту и read-only share links должны быть самодостаточными, с понятными подсказками, копированием ссылок и безопасным отзывом доступа.",
        "- [ ] Провести целевой QA для builder/viewer/members, чтобы не было регрессий в партнерах, родителях, действиях над узлами и режимах доступа.",
        "- [ ] Держать startup context, task capsules и memory-файлы актуальными: `.claude/BACKLOG.md` и `.claude/SNAPSHOT.md` должны отражать реальный workstream текущего цикла.",
    ]
    if not status.get("upload_flow_complete"):
        high_priority.insert(
            0,
            "- [ ] Подтвердить, что единый upload для фото и видео с устройства, multi-file, progress и limits copy работают без остаточных регрессий.",
        )

    medium_priority = [
        "- [ ] Подготовить отдельный exploratory stream для `Cloudflare R2`, не ломая текущий `Yandex Object Storage` path.",
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


def _sync_antigravity_manual_memory(root: Path, timestamp_utc: str, branch: str) -> List[str]:
    if not _is_antigravity_repo(root):
        return []

    status = _detect_antigravity_media_status(root)
    date_label = timestamp_utc.split(" ")[0]
    updated_files: List[str] = []

    snapshot_path = root / ".claude" / "SNAPSHOT.md"
    snapshot_content = _read_text_or_empty(snapshot_path)
    snapshot_sections = _build_antigravity_snapshot_sections(branch, status)
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
        _build_antigravity_backlog_active_sprint(status),
    )
    if _write_if_changed(backlog_path, next_backlog, backlog_content):
        updated_files.append(backlog_path.as_posix())

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
        changed_paths = _collect_changed_paths(limit=10)

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

        updated_paths = set()
        for path, auto_content in targets.items():
            architecture_changed = False
            if path == root / STATE_FILES[2]:
                architecture_changed = _upsert_marked_block(path, "FRAMEWORK:ARCHITECTURE", architecture_state)
            auto_changed = _upsert_marked_block(path, "FRAMEWORK:AUTO", auto_content)
            session_changed = _upsert_marked_block(path, "FRAMEWORK:SESSION", session_block)
            if architecture_changed or auto_changed or session_changed:
                updated_paths.add(path.as_posix())
            logging.info(
                "memory_sync: file=%s architecture_changed=%s auto_changed=%s session_changed=%s",
                path.as_posix(),
                architecture_changed,
                auto_changed,
                session_changed,
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
