"""Integration-style tests for completion command pipeline."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


FRAMEWORK_CORE_ROOT = Path(__file__).resolve().parents[1]
if str(FRAMEWORK_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(FRAMEWORK_CORE_ROOT))

from commands import completion  # noqa: E402


def _task(name, status="success", result="", error=None):
    payload = {"name": name, "status": status, "result": result}
    if error:
        payload["error"] = error
    return payload


class CompletionCommandTests(unittest.TestCase):
    def _parallel_success_results(self):
        return [
            _task("security_cleanup", result="SECURITY:clean"),
            _task("dialog_export", result="EXPORT:skipped:disabled"),
            _task("git_status", result="STATUS:2 files"),
            _task("git_diff", result="DIFF:42 lines"),
        ]

    @patch.object(completion, "release_session_lock", return_value=_task("session_lock_release", result="LOCK:released"))
    @patch.object(completion, "mark_clean_task", return_value=_task("mark_clean", result="SESSION:clean"))
    @patch.object(completion, "sync_shared_memory_task", return_value=_task("memory_sync", result="MEMORY:updated:3"))
    @patch.object(completion, "run_tasks_parallel")
    @patch.object(completion, "ensure_project_baseline", return_value=_task("project_baseline", result="BASELINE:created:0:updated:0"))
    @patch.object(completion, "init_config", return_value=_task("config_init", result="CONFIG:exists"))
    def test_completion_always_runs_memory_sync(
        self,
        init_config_mock,
        baseline_mock,
        run_parallel_mock,
        memory_sync_mock,
        mark_clean_mock,
        release_lock_mock,
    ):
        run_parallel_mock.return_value = self._parallel_success_results()

        result = completion.run_completion()

        self.assertEqual(result.get("status"), "success")
        tasks = result.get("tasks", [])
        task_names = [task.get("name") for task in tasks]
        self.assertIn("memory_sync", task_names)
        self.assertLess(task_names.index("memory_sync"), task_names.index("mark_clean"))
        self.assertLess(task_names.index("memory_sync"), task_names.index("session_lock_release"))

        memory_sync_mock.assert_called_once()
        kwargs = memory_sync_mock.call_args.kwargs
        self.assertEqual(kwargs.get("git_status_result"), "STATUS:2 files")
        self.assertEqual(kwargs.get("git_diff_result"), "DIFF:42 lines")
        self.assertIsInstance(kwargs.get("task_results"), list)

    @patch.object(completion, "release_session_lock", return_value=_task("session_lock_release", result="LOCK:released"))
    @patch.object(completion, "mark_clean_task", return_value=_task("mark_clean", result="SESSION:clean"))
    @patch.object(completion, "sync_shared_memory_task", return_value=_task("memory_sync", status="error", error="write failed"))
    @patch.object(completion, "run_tasks_parallel")
    @patch.object(completion, "ensure_project_baseline", return_value=_task("project_baseline", result="BASELINE:created:0:updated:0"))
    @patch.object(completion, "init_config", return_value=_task("config_init", result="CONFIG:exists"))
    def test_memory_sync_error_is_non_blocking(
        self,
        init_config_mock,
        baseline_mock,
        run_parallel_mock,
        memory_sync_mock,
        mark_clean_mock,
        release_lock_mock,
    ):
        run_parallel_mock.return_value = self._parallel_success_results()

        result = completion.run_completion()

        self.assertEqual(result.get("status"), "success")
        warnings = result.get("warnings")
        self.assertIsInstance(warnings, list)
        self.assertTrue(any(item.get("task") == "memory_sync" for item in warnings))
        self.assertTrue(any(task.get("name") == "memory_sync" and task.get("status") == "error" for task in result.get("tasks", [])))

    @patch.object(completion, "release_session_lock", return_value=_task("session_lock_release", result="LOCK:released"))
    @patch.object(completion, "mark_clean_task", return_value=_task("mark_clean", result="SESSION:clean"))
    @patch.object(completion, "sync_shared_memory_task", return_value=_task("memory_sync", result="MEMORY:updated:3"))
    @patch.object(completion, "run_tasks_parallel")
    @patch.object(completion, "ensure_project_baseline", return_value=_task("project_baseline", result="BASELINE:created:0:updated:0"))
    @patch.object(completion, "init_config", return_value=_task("config_init", result="CONFIG:exists"))
    def test_blocking_task_error_still_fails_completion(
        self,
        init_config_mock,
        baseline_mock,
        run_parallel_mock,
        memory_sync_mock,
        mark_clean_mock,
        release_lock_mock,
    ):
        run_parallel_mock.return_value = [
            _task("security_cleanup", result="SECURITY:clean"),
            _task("dialog_export", result="EXPORT:skipped:disabled"),
            _task("git_status", status="error", error="git failed"),
            _task("git_diff", result="DIFF:42 lines"),
        ]

        result = completion.run_completion()

        self.assertEqual(result.get("status"), "error")
        errors = result.get("errors", [])
        self.assertTrue(any(item.get("task") == "git_status" for item in errors))
        self.assertTrue(any(task.get("name") == "memory_sync" for task in result.get("tasks", [])))


if __name__ == "__main__":
    unittest.main()

