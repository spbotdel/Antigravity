"""Git hooks installation tasks."""

import os
import shutil
import subprocess
from pathlib import Path
from utils.parallel import time_task
from utils.result import create_task_result


def _git_bash_candidates():
    program_files = [
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        r"C:\Program Files",
        r"C:\Program Files (x86)",
    ]
    seen = set()
    for root in program_files:
        if not root or root in seen:
            continue
        seen.add(root)
        yield Path(root) / "Git" / "bin" / "bash.exe"
        yield Path(root) / "Git" / "usr" / "bin" / "bash.exe"


def _resolve_bash_executable() -> str:
    bash_path = shutil.which("bash")
    if bash_path:
        bash_lower = bash_path.lower()
        if os.name != "nt" or "windowsapps" not in bash_lower:
            return bash_path

    if os.name == "nt":
        for candidate in _git_bash_candidates():
            if candidate.exists():
                return str(candidate)

    return bash_path or "bash"


@time_task
def install_git_hooks():
    """Install git hooks silently.

    Returns:
        dict: Task result
    """
    try:
        hook_script = Path(".claude/scripts/install-git-hooks.sh")

        if not hook_script.exists():
            return create_task_result("git_hooks", "success", "HOOKS:skipped")

        # Run installation script
        subprocess.run(
            [_resolve_bash_executable(), str(hook_script)],
            capture_output=True,
            check=True
        )

        return create_task_result("git_hooks", "success", "HOOKS:done")

    except subprocess.CalledProcessError as e:
        return create_task_result("git_hooks", "error", "", error=str(e))
    except Exception as e:
        return create_task_result("git_hooks", "error", "", error=str(e))
