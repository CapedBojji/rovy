#!/usr/bin/env python3
"""Build an example rbxl, open Roblox Studio, then run build.py -w in parallel.

Tracks the spawned Studio process via .studio.pid lockfile.
On Ctrl+C cleanly shuts down the build watcher and that Studio instance,
leaving any pre-existing Studio windows alone.

Usage:
    python scripts/start.py example              # build + open + watch
    python scripts/start.py zombie
    python scripts/start.py open example         # open Studio only
    python scripts/start.py open zombie
"""
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
PID_FILE = ROOT / ".studio.pid"
STUDIO_PROCESS_NAME = "RobloxStudio"

RBXL: dict[str, Path] = {
    "example": ROOT / "build" / "rovy-example.rbxl",
    "ui-inventory": ROOT / "build" / "rovy-ui-inventory-game.rbxl",
    "zombie": ROOT / "build" / "rovy-zombie-game.rbxl",
}


def log(msg: str) -> None:
    print(f"[start] {msg}", flush=True)


def get_studio_pids() -> set[int]:
    result = subprocess.run(
        ["pgrep", "-x", STUDIO_PROCESS_NAME],
        capture_output=True,
        text=True,
    )
    if result.returncode not in (0, 1):
        log(f"Warning: pgrep failed (exit {result.returncode}): {result.stderr}")
        return set()
    return {int(line) for line in result.stdout.split() if line.strip()}


def write_studio_pid(pid: int) -> None:
    PID_FILE.write_text(str(pid))


def read_studio_pid() -> Optional[int]:
    try:
        return int(PID_FILE.read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def kill_pid(pid: int, label: str) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    log(f"Sent SIGTERM to {label} (pid {pid})")
    for _ in range(50):
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.1)
    log(f"{label} (pid {pid}) didn't exit, sending SIGKILL")
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def open_studio(target: str) -> Optional[int]:
    rbxl = RBXL[target]
    if not rbxl.exists():
        log(f"rbxl not found: {rbxl.relative_to(ROOT)} — run `pnpm build:{target}` first")
        return None

    existing = read_studio_pid()
    if existing and pid_alive(existing):
        log(f"Studio already open (pid {existing}). Doing nothing.")
        return None

    log(f"Opening {rbxl.relative_to(ROOT)} in Roblox Studio...")
    before = get_studio_pids()
    subprocess.run(["open", str(rbxl)], check=True)

    for _ in range(20):
        time.sleep(0.5)
        new_pids = get_studio_pids() - before
        if new_pids:
            pid = next(iter(new_pids))
            write_studio_pid(pid)
            log(f"Studio launched (pid {pid}).")
            return pid

    log("Warning: could not identify spawned Studio pid.")
    return None


def main(target: str) -> None:
    studio_pid: Optional[int] = None
    build_proc: Optional[subprocess.Popen] = None

    def cleanup(*_) -> None:
        print()
        log("Shutting down...")
        if build_proc and build_proc.poll() is None:
            build_proc.terminate()
            try:
                build_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                build_proc.kill()
        tracked_studio_pid = read_studio_pid() or studio_pid
        if tracked_studio_pid is not None:
            kill_pid(tracked_studio_pid, "Roblox Studio")
        PID_FILE.unlink(missing_ok=True)
        log("Done.")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    build_script = ROOT / "scripts" / "build.py"
    log(f"Running one-shot build ({target})...")
    subprocess.run([sys.executable, str(build_script), target], cwd=ROOT, check=True)

    studio_pid = open_studio(target)

    log("Starting build watcher...")
    build_proc = subprocess.Popen(
        [sys.executable, str(build_script), target, "-w"],
        cwd=ROOT,
    )

    log("Running. Ctrl+C to stop everything.")

    try:
        build_proc.wait()
    except KeyboardInterrupt:
        cleanup()

    cleanup()


if __name__ == "__main__":
    args = sys.argv[1:]
    targets = list(RBXL.keys())

    if args and args[0] in {"open", "open-studio"}:
        target = args[1] if len(args) > 1 else "example"
        if target not in RBXL:
            print(f"Unknown target: {target}. Choose: {', '.join(targets)}", file=sys.stderr)
            sys.exit(1)
        open_studio(target)
    else:
        target = next((a for a in args if a in RBXL), "example")
        main(target)
