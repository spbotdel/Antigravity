"""Completion command implementation."""

import time
from utils.result import create_result
from utils.parallel import run_tasks_parallel
from tasks.git import check_git_status, get_git_diff
from tasks.security import cleanup_dialogs, export_dialogs
from tasks.config import init_config, ensure_project_baseline
from tasks.memory import sync_shared_memory_task
from tasks.session import mark_clean_task, release_session_lock


def _find_task_result(task_results, task_name, fallback):
    for task in task_results:
        if task.get("name") == task_name:
            value = task.get("result")
            if value:
                return value
            break
    return fallback


def run_completion():
    """Run completion protocol.

    Executes completion tasks and returns structured result.

    Returns:
        dict: Result with status, tasks, and timing info
    """
    start_time = time.time()

    # Normalize config and refresh only existing baseline files.
    # Missing baseline files must be created during migration/upgrade flows.
    bootstrap_results = [
        init_config(),
        ensure_project_baseline(create_missing=False),
    ]

    # Define tasks to run in parallel
    tasks = [
        cleanup_dialogs,     # Security cleanup
        export_dialogs,      # Dialog export
        check_git_status,    # Git status
        get_git_diff         # Git diff
    ]

    # Run all tasks in parallel
    task_results = bootstrap_results + run_tasks_parallel(tasks)

    git_status_result = _find_task_result(task_results, "git_status", "STATUS:unavailable")
    git_diff_result = _find_task_result(task_results, "git_diff", "DIFF:unavailable")

    # Shared memory sync is non-blocking for completion status:
    # task-level error is still recorded in JSON.
    try:
        memory_result = sync_shared_memory_task(
            git_status_result=git_status_result,
            git_diff_result=git_diff_result,
            task_results=task_results,
        )
    except Exception as error:
        memory_result = {
            "name": "memory_sync",
            "status": "error",
            "result": "",
            "error": str(error),
        }
    task_results.append(memory_result)

    # Finalize session state and release ownership lock.
    task_results.append(mark_clean_task())
    task_results.append(release_session_lock())

    # Check for errors
    blocking_errors = [
        {
            "task": r.get("name"),
            "message": r.get("error", "Unknown error")
        }
        for r in task_results
        if r.get("status") == "error" and r.get("name") != "memory_sync"
    ]
    warnings = [
        {
            "task": r.get("name"),
            "message": r.get("error", "Unknown error")
        }
        for r in task_results
        if r.get("status") == "error" and r.get("name") == "memory_sync"
    ]

    # Calculate total duration
    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)

    # Return result
    if blocking_errors:
        return create_result(
            status="error",
            command="completion",
            tasks=task_results,
            errors=blocking_errors,
            warnings=warnings if warnings else None,
            duration_ms=duration_ms
        )

    return create_result(
        status="success",
        command="completion",
        tasks=task_results,
        warnings=warnings if warnings else None,
        duration_ms=duration_ms
    )
