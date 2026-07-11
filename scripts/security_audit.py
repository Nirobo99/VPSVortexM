import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], cwd: Path) -> int:
    print(f"\n$ {' '.join(cmd)}")
    return subprocess.call(cmd, cwd=str(cwd))


def resolve_command(name: str) -> str | None:
    candidates = [name]
    if os.name == "nt":
        candidates.insert(0, f"{name}.cmd")
        candidates.insert(1, f"{name}.exe")
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def main() -> int:
    failures = 0

    pip_audit = resolve_command("pip-audit")
    if pip_audit:
        failures += run([pip_audit, "-r", "requirements.txt"], ROOT / "backend")
    else:
        print("pip-audit is not installed. Install with: pip install pip-audit")

    npm = resolve_command("npm")
    if npm:
        failures += run([npm, "audit", "--omit=dev"], ROOT / "frontend")
    else:
        print("npm is not installed.")

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
