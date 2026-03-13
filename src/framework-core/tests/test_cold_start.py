"""Regression tests for cold-start session state and hook bash resolution."""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


FRAMEWORK_CORE_ROOT = Path(__file__).resolve().parents[1]
if str(FRAMEWORK_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(FRAMEWORK_CORE_ROOT))

from commands import cold_start  # noqa: E402
from tasks import hooks  # noqa: E402


def _task(name, status="success", result="", error=None):
    payload = {"name": name, "status": status, "result": result}
    if error:
        payload["error"] = error
    return payload


class ColdStartCommandTests(unittest.TestCase):
    @patch.object(cold_start, "get_context_files", return_value=["README.md"])
    @patch.object(cold_start, "mark_active", return_value=_task("mark_active", result="SESSION:active"))
    @patch.object(cold_start, "run_tasks_parallel")
    @patch.object(cold_start, "check_crash", return_value=_task("crash_detection", result="CRASH:none"))
    @patch.object(cold_start, "acquire_session_lock", return_value=_task("session_lock", result="LOCK:acquired"))
    @patch.object(cold_start, "init_config", return_value=_task("config_init", result="CONFIG:exists"))
    def test_cold_start_marks_session_active_only_on_success(
        self,
        init_config_mock,
        acquire_lock_mock,
        check_crash_mock,
        run_parallel_mock,
        mark_active_mock,
        get_context_files_mock,
    ):
        run_parallel_mock.return_value = [
            _task("migration_cleanup", result="CLEANUP:done"),
            _task("version_check", result="UPDATE:none:4.0.2"),
            _task("security_cleanup", result="SECURITY:skipped:disabled"),
            _task("dialog_export", result="EXPORT:skipped:disabled"),
            _task("commit_policy", result="POLICY:exists"),
            _task("git_hooks", result="HOOKS:done"),
        ]

        result = cold_start.run_cold_start()

        self.assertEqual(result.get("status"), "success")
        mark_active_mock.assert_called_once()
        task_names = [task.get("name") for task in result.get("tasks", [])]
        self.assertEqual(task_names[-2:], ["context_files", "mark_active"])

    @patch.object(cold_start, "release_session_lock", return_value=_task("session_lock_release", result="LOCK:released"))
    @patch.object(cold_start, "get_context_files", return_value=["README.md"])
    @patch.object(cold_start, "mark_active", return_value=_task("mark_active", result="SESSION:active"))
    @patch.object(cold_start, "run_tasks_parallel")
    @patch.object(cold_start, "check_crash", return_value=_task("crash_detection", result="CRASH:none"))
    @patch.object(cold_start, "acquire_session_lock", return_value=_task("session_lock", result="LOCK:acquired"))
    @patch.object(cold_start, "init_config", return_value=_task("config_init", result="CONFIG:exists"))
    def test_cold_start_error_does_not_mark_session_active(
        self,
        init_config_mock,
        acquire_lock_mock,
        check_crash_mock,
        run_parallel_mock,
        mark_active_mock,
        get_context_files_mock,
        release_lock_mock,
    ):
        run_parallel_mock.return_value = [
            _task("migration_cleanup", result="CLEANUP:done"),
            _task("version_check", result="UPDATE:none:4.0.2"),
            _task("security_cleanup", result="SECURITY:skipped:disabled"),
            _task("dialog_export", result="EXPORT:skipped:disabled"),
            _task("commit_policy", result="POLICY:exists"),
            _task("git_hooks", status="error", error="bash failed"),
        ]

        result = cold_start.run_cold_start()

        self.assertEqual(result.get("status"), "error")
        mark_active_mock.assert_not_called()
        release_lock_mock.assert_called_once()
        task_names = [task.get("name") for task in result.get("tasks", [])]
        self.assertNotIn("mark_active", task_names)


class HookResolutionTests(unittest.TestCase):
    @patch.object(hooks, "os")
    @patch.object(hooks.shutil, "which", return_value=r"C:\Users\Acer\AppData\Local\Microsoft\WindowsApps\bash.exe")
    @patch.object(hooks, "_git_bash_candidates")
    def test_resolve_bash_executable_prefers_git_bash_over_windowsapps_stub(
        self,
        candidates_mock,
        which_mock,
        os_mock,
    ):
        os_mock.name = "nt"
        git_bash = MagicMock()
        git_bash.exists.return_value = True
        git_bash.__str__.return_value = r"C:\Program Files\Git\bin\bash.exe"
        candidates_mock.return_value = [git_bash]

        resolved = hooks._resolve_bash_executable()

        self.assertEqual(resolved, r"C:\Program Files\Git\bin\bash.exe")

    @patch.object(hooks, "os")
    @patch.object(hooks.shutil, "which", return_value="/usr/bin/bash")
    def test_resolve_bash_executable_keeps_normal_bash_path(self, which_mock, os_mock):
        os_mock.name = "posix"

        resolved = hooks._resolve_bash_executable()

        self.assertEqual(resolved, "/usr/bin/bash")


if __name__ == "__main__":
    unittest.main()
