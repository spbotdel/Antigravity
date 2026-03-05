"""Shared memory synchronization tasks for completion."""

import json
import logging
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional

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

        updated_files = 0
        for path, auto_content in targets.items():
            auto_changed = _upsert_marked_block(path, "FRAMEWORK:AUTO", auto_content)
            session_changed = _upsert_marked_block(path, "FRAMEWORK:SESSION", session_block)
            if auto_changed or session_changed:
                updated_files += 1
            logging.info(
                "memory_sync: file=%s auto_changed=%s session_changed=%s",
                path.as_posix(),
                auto_changed,
                session_changed,
            )

        logging.info(
            "memory_sync: completed updated_files=%s branch=%s status=%s diff=%s",
            updated_files,
            branch,
            git_status_result,
            git_diff_result,
        )

        return create_task_result("memory_sync", "success", f"MEMORY:updated:{updated_files}")
    except Exception as error:
        logging.exception("memory_sync: failed")
        return create_task_result("memory_sync", "error", "", error=str(error))
