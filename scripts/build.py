#!/usr/bin/env python3
"""Build a Rovy example.

Usage:
    python scripts/build.py example        # one-shot build
    python scripts/build.py example -w     # build then watch
    python scripts/build.py zombie
    python scripts/build.py zombie -w
"""
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TARGETS: dict[str, dict] = {
    "example": {
        "packages": [
            ["--filter", "rovy-transformer", "build"],
            ["--filter", "@rovy/core", "build"],
            ["--filter", "@rovy/example-gameclock", "build"],
            ["--filter", "@rovy/example-game", "build:place"],
        ],
        "rbxl": ROOT / "build" / "rovy-example.rbxl",
        "example_dir": ROOT / "examples" / "roblox-ts-game",
    },
    "ui-inventory": {
        "packages": [
            ["--filter", "rovy-transformer", "build"],
            ["--filter", "@rovy/core", "build"],
            ["--filter", "@rovy/ui", "build"],
            ["--filter", "@rovy/example-ui-inventory-game", "build:place"],
        ],
        "rbxl": ROOT / "build" / "rovy-ui-inventory-game.rbxl",
        "example_dir": ROOT / "examples" / "ui-inventory-game",
    },
    "zombie": {
        "packages": [
            ["--filter", "rovy-transformer", "build"],
            ["--filter", "@rovy/core", "build"],
            ["--filter", "@rovy/networking", "build"],
            ["--filter", "@rovy/example-zombie-game", "build:place"],
        ],
        "rbxl": ROOT / "build" / "rovy-zombie-game.rbxl",
        "example_dir": ROOT / "examples" / "zombie-game",
    },
}


def log(msg: str) -> None:
    print(f"[build] {msg}", flush=True)


def run(cmd: list[str], cwd: Path = ROOT) -> None:
    log(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def pnpm(*args: str) -> list[str]:
    return ["pnpm", *args]


def mise(*args: str) -> list[str]:
    return ["mise", "exec", "-y", "--", *args]


def one_shot_build(target: dict) -> None:
    log("Installing packages...")
    run(pnpm("install", "--frozen-lockfile"))
    for pkg_args in target["packages"]:
        run(pnpm(*pkg_args))
    log(f"Done → {target['rbxl'].relative_to(ROOT)}")


def watch(target: dict) -> None:
    example_dir: Path = target["example_dir"]
    procs: list[subprocess.Popen] = []

    def cleanup(*_) -> None:
        print()
        log("Stopping watchers...")
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                p.kill()
        log("Done.")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    rojo_serve = subprocess.Popen(
        mise("rojo", "serve", "default.project.json"),
        cwd=example_dir,
    )
    procs.append(rojo_serve)
    log(f"rojo serve             (pid {rojo_serve.pid})")

    sourcemap_proc = subprocess.Popen(
        mise("rojo", "sourcemap", "default.project.json", "--watch", "--output", "sourcemap.json"),
        cwd=example_dir,
    )
    procs.append(sourcemap_proc)
    log(f"rojo sourcemap --watch (pid {sourcemap_proc.pid})")

    rbxtsc_watch = subprocess.Popen(
        pnpm("exec", "rbxtsc", "-w"),
        cwd=example_dir,
    )
    procs.append(rbxtsc_watch)
    log(f"rbxtsc --watch         (pid {rbxtsc_watch.pid})")

    log("Watching for changes. Ctrl+C to stop.")

    try:
        while True:
            time.sleep(0.5)
            for p in procs:
                if p.poll() is not None:
                    log(f"Child process {p.pid} exited with {p.returncode}")
                    cleanup()
    except KeyboardInterrupt:
        cleanup()


def main() -> None:
    args = sys.argv[1:]
    target_name = next((a for a in args if a in TARGETS), None)
    if target_name is None:
        print(f"Usage: build.py <{'|'.join(TARGETS)}> [-w]", file=sys.stderr)
        sys.exit(1)

    target = TARGETS[target_name]
    one_shot_build(target)
    if "-w" in args:
        watch(target)


if __name__ == "__main__":
    main()
