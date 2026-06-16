#!/usr/bin/env node
import cp, { type ChildProcess } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import readline from "node:readline";
import ts from "typescript";
import {
  loadRovyBuildConfig,
  type ResolvedRovyBuildConfig,
  type RovyBuildConfigFile,
} from "rovy-transformer/dist/rovy-config";

type CommandName =
  | "compile"
  | "generate"
  | "build"
  | "open"
  | "watch"
  | "start"
  | "stop"
  | "publish"
  | "init";
type Runner = (
  command: string,
  args?: readonly string[],
  options?: cp.SpawnOptions,
) => Promise<void>;
export interface PublishRequest {
  readonly url: string;
  readonly apiKey: string;
  readonly contentType: string;
  readonly body: Buffer;
}

export interface PublishResponse {
  readonly statusCode: number;
  readonly body: string;
}

type PublishRequester = (request: PublishRequest) => Promise<PublishResponse>;

const DEFAULT_PLACE_FILE = "game.rbxl";
const DEFAULT_SCRIPT_NAMES = {
  compile: "compile",
  generate: "generate",
  build: "build",
  open: "open",
  watch: "watch",
  start: "start",
  stop: "stop",
  publish: "publish",
} as const;

export interface CommandContext {
  readonly projectDir: string;
  readonly run: Runner;
  readonly publishRequest?: PublishRequester;
}

export async function runCli(
  argv = process.argv.slice(2),
  context?: Partial<CommandContext>,
): Promise<void> {
  const command = (argv[0] ?? "build") as CommandName;
  const projectDir = context?.projectDir ?? process.cwd();
  const run = context?.run ?? runCommand;
  const publishRequest = context?.publishRequest ?? publishPlaceVersion;

  switch (command) {
    case "compile":
      await compile({ projectDir, run });
      return;
    case "generate":
      await generate({ projectDir, run });
      return;
    case "build":
      await build({ projectDir, run });
      return;
    case "open":
      await openProject({ projectDir, run });
      return;
    case "watch":
      await watch({ projectDir, run });
      return;
    case "start":
      await start({ projectDir, run });
      return;
    case "stop":
      await stop({ projectDir, run });
      return;
    case "publish":
      await publishPlace({ projectDir, run, publishRequest });
      return;
    case "init":
      await init(projectDir);
      return;
    default:
      throw new Error(`unknown rovy-build command: ${command}`);
  }
}

export async function compile(context: CommandContext): Promise<void> {
  const config = readConfig(context.projectDir);
  await context.run("rbxtsc", rbxtscArgs(config), {
    cwd: context.projectDir,
    stdio: "inherit",
  });
  if (config.build.generateBlink !== false) await generate(context);
}

export async function generate(context: CommandContext): Promise<void> {
  const config = readConfig(context.projectDir);
  if (config.build.generateBlink === false) return;
  const { generateBlink } =
    require("rovy-transformer/scripts/generate-blink.js") as {
      generateBlink: (projectDir: string) => void;
    };
  generateBlink(context.projectDir);
}

export async function build(context: CommandContext): Promise<void> {
  const config = readConfig(context.projectDir);
  await compile(context);
  const args = rojoBuildArgs(config);
  ensureRojoBuildOutputDir(context.projectDir, args);
  await context.run("rojo", args, {
    cwd: context.projectDir,
    stdio: "inherit",
  });
}

export async function publishPlace(context: CommandContext): Promise<void> {
  const config = readConfig(context.projectDir);
  const publishConfig = config.build.publish;
  if (publishConfig === undefined)
    throw new Error("rovy-build.publish is required for rovy publish");

  const universeId = requiredNumericConfig(
    publishConfig.universeId,
    "rovy-build.publish.universeId",
  );
  const placeId = requiredNumericConfig(
    publishConfig.placeId,
    "rovy-build.publish.placeId",
  );
  const versionType = publishVersionType(publishConfig.versionType);
  const placeFile = placeFilePath(context.projectDir, config);
  if (!fs.existsSync(placeFile))
    throw new Error(`place file missing: ${placeFile}`);
  const apiKey = process.env.ROBLOX_API_KEY ?? process.env.ROBLOX_OPEN_CLOUD_API_KEY;
  if (!apiKey)
    throw new Error(
      "ROBLOX_API_KEY is required for rovy publish (ROBLOX_OPEN_CLOUD_API_KEY is also supported)",
    );

  const contentType = placeFileContentType(placeFile);
  const body = fs.readFileSync(placeFile);
  const url = `https://apis.roblox.com/universes/v1/${universeId}/places/${placeId}/versions?versionType=${versionType}`;
  const request = context.publishRequest ?? publishPlaceVersion;
  const response = await request({ url, apiKey, contentType, body });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const detail = sanitizeResponseBody(response.body, apiKey);
    throw new Error(
      `place publish failed (${response.statusCode})${detail ? `: ${detail}` : ""}`,
    );
  }

  const version = publishedVersionNumber(response.body);
  console.log(
    `[rovy-build] published ${path.relative(context.projectDir, placeFile)} to universe ${universeId} place ${placeId}${version ? ` (version ${version})` : ""}`,
  );
}

export async function openProject(context: CommandContext): Promise<void> {
  const config = readConfig(context.projectDir);

  const existingStudioPids = pruneStudioPids(context.projectDir);
  const existingStudio = existingStudioPids[0];
  if (existingStudio !== undefined) {
    console.log(`[rovy-build] Studio already open (pid ${existingStudio})`);
    if (config.build.watchOnOpen !== false)
      await watch(context, { stopStudioOnExit: false });
    return;
  }

  await openStudio(context);
  if (config.build.watchOnOpen !== false)
    await watch(context, { stopStudioOnExit: true });
}

export async function openStudio(context: CommandContext): Promise<void> {
  const config = readConfig(context.projectDir);
  const placeFile = placeFilePath(context.projectDir, config);
  if (!fs.existsSync(placeFile))
    throw new Error(`place file missing: ${placeFile}`);

  const before =
    process.platform === "darwin" ? studioPids() : new Set<number>();
  await openFile(placeFile, context.run);
  if (process.platform === "darwin") {
    const pid = waitForNewStudioPid(before);
    if (pid !== undefined) {
      const tracked = new Set(
        [...readPids(context.projectDir, "studio.pid"), pid].filter(
          isStudioPid,
        ),
      );
      writePid(context.projectDir, "studio.pid", [...tracked]);
    }
  }
}

export async function start(context: CommandContext): Promise<void> {
  await build(context);
  await openProject(context);
}

export async function stop(context: CommandContext): Promise<void> {
  const pids = [
    ...readPids(context.projectDir, "watch.pid"),
    ...readPids(context.projectDir, "studio.pid"),
  ];
  for (const pid of pids) {
    await killPid(pid, "tracked process");
  }
  removePid(context.projectDir, "watch.pid");
  removePid(context.projectDir, "studio.pid");
}

export async function watch(
  context: CommandContext,
  options: { readonly stopStudioOnExit?: boolean } = {},
): Promise<void> {
  const config = readConfig(context.projectDir);
  const children: ChildProcess[] = [];
  let stopping = false;
  for (const pid of readPids(context.projectDir, "watch.pid")) {
    if (isTrackedWatchProcess(pid))
      await killPid(pid, "previous watch process");
  }
  removePid(context.projectDir, "watch.pid");
  const spawnChild = (command: string, args: readonly string[]) => {
    console.log(`[rovy-build] ${command} ${args.join(" ")}`);
    const child = cp.spawn(command, [...args], {
      cwd: context.projectDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
    });
    children.push(child);
    return child;
  };

  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      signalChild(child, "SIGTERM");
    }
    await waitForChildren(children, 3000);
    for (const child of children) {
      if (child.pid && child.exitCode === null && child.signalCode === null)
        signalChild(child, "SIGKILL");
    }
    if (options.stopStudioOnExit) {
      for (const pid of readPids(context.projectDir, "studio.pid")) {
        await killPid(pid, "Roblox Studio");
      }
      removePid(context.projectDir, "studio.pid");
    } else {
      pruneStudioPids(context.projectDir);
    }
    removePid(context.projectDir, "watch.pid");
  };
  const cleanupSync = () => {
    for (const child of children) {
      signalChild(child, "SIGTERM");
    }
    pruneStudioPids(context.projectDir);
    removePid(context.projectDir, "watch.pid");
  };
  process.once("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
  process.once("exit", cleanupSync);

  const rbxtscWatchArgs = ["-w", ...rbxtscArgs(config)];
  const rojoProject = config.environment.rojo ?? "default.project.json";
  spawnChild("rojo", ["serve", rojoProject]);
  if (config.environment.sourcemap) {
    spawnChild("rojo", [
      "sourcemap",
      rojoProject,
      "--watch",
      "--output",
      config.environment.sourcemap,
    ]);
  }
  spawnChild("rbxtsc", rbxtscWatchArgs);
  writePid(
    context.projectDir,
    "watch.pid",
    children
      .map((child) => child.pid)
      .filter((pid): pid is number => pid !== undefined),
  );
  const shell = startInteractiveShell(context, {
    cleanup,
    openStudio: () => openStudio(context),
    compile: () => compile(context),
    generate: () => generate(context),
    build: () => build(context),
    publish: () => publishPlace(context),
    stop: () => stop(context),
  });
  shell.once("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  let generating = false;
  let lastBuildInfo = fileMtime(tsBuildInfoPath(context.projectDir));
  const maybeGenerate = async () => {
    if (config.build.generateBlink === false || generating) return;
    generating = true;
    try {
      await generate(context);
    } catch (error) {
      console.error(
        `[rovy-build] generation failed: ${String(error instanceof Error ? error.message : error)}`,
      );
    } finally {
      generating = false;
    }
  };

  const poll = setInterval(() => {
    const nextBuildInfo = fileMtime(tsBuildInfoPath(context.projectDir));
    if (nextBuildInfo !== 0 && nextBuildInfo !== lastBuildInfo) {
      lastBuildInfo = nextBuildInfo;
      void maybeGenerate();
      return;
    }
    if (!blinkOutputsPresent(context.projectDir)) void maybeGenerate();
  }, 500);

  await new Promise<void>((resolve, reject) => {
    for (const child of children) {
      child.once("exit", (code) => {
        clearInterval(poll);
        shell.close();
        void cleanup().then(() => {
          if (code === 0 || code === null) resolve();
          else reject(new Error(`watch child exited with code ${code}`));
        }, reject);
      });
    }
  });
}

function startInteractiveShell(
  context: CommandContext,
  actions: {
    readonly cleanup: () => Promise<void>;
    readonly openStudio: () => Promise<void>;
    readonly compile: () => Promise<void>;
    readonly generate: () => Promise<void>;
    readonly build: () => Promise<void>;
    readonly publish: () => Promise<void>;
    readonly stop: () => Promise<void>;
  },
): readline.Interface {
  const shell = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "rovy-build> ",
  });
  let running = false;
  const runAction = async (name: string, action: () => Promise<void>) => {
    if (running) {
      console.log("[rovy-build] command already running");
      return;
    }
    running = true;
    try {
      await action();
    } catch (error) {
      console.error(
        `[rovy-build] ${name} failed: ${String(error instanceof Error ? error.message : error)}`,
      );
    } finally {
      running = false;
      shell.prompt();
    }
  };
  console.log(
    "[rovy-build] interactive shell ready. Type 'help' for commands.",
  );
  shell.prompt();
  shell.on("line", (line) => {
    const [command] = line.trim().split(/\s+/);
    switch (command) {
      case "":
        shell.prompt();
        return;
      case "help":
      case "?":
        printInteractiveHelp();
        shell.prompt();
        return;
      case "open":
        void runAction("open", actions.openStudio);
        return;
      case "compile":
        void runAction("compile", actions.compile);
        return;
      case "generate":
      case "gen":
        void runAction("generate", actions.generate);
        return;
      case "build":
        void runAction("build", actions.build);
        return;
      case "publish":
        void runAction("publish", actions.publish);
        return;
      case "stop":
        void runAction("stop", async () => {
          await actions.stop();
          await actions.cleanup();
          process.exit(0);
        });
        return;
      case "quit":
      case "exit":
        void runAction("exit", async () => {
          await actions.cleanup();
          process.exit(0);
        });
        return;
      default:
        console.log(`[rovy-build] unknown command '${command}'. Type 'help'.`);
        shell.prompt();
    }
  });
  shell.on("close", () => {});
  return shell;
}

function printInteractiveHelp(): void {
  console.log(
    [
      "commands:",
      "  help      show this help",
      "  open      open configured place file again",
      "  compile   run rbxtsc and generators once",
      "  generate  run Rovy generators once",
      "  build     run compile and Rojo build once",
      "  publish   publish the configured place file through Open Cloud",
      "  stop      stop tracked Studio/watch processes and exit",
      "  exit      stop this watch session and exit",
    ].join("\n"),
  );
}

export async function init(projectDir: string): Promise<void> {
  const packagePath = path.join(projectDir, "package.json");
  const packageJson = JSON.parse(
    fs.readFileSync(packagePath, "utf8"),
  ) as Record<string, unknown>;
  const existingBuild = isRecord(packageJson["rovy-build"])
    ? packageJson["rovy-build"]
    : {};
  const rovyPath = path.join(projectDir, ".rovy.json");
  const rovyConfig = fs.existsSync(rovyPath)
    ? JSON.parse(fs.readFileSync(rovyPath, "utf8"))
    : {};
  const buildConfig = {
    $schema: "./node_modules/@rovy/core/schema/rovy-build.schema.json",
    placeFile: DEFAULT_PLACE_FILE,
    rbxtscArgs: ["--type", "game"],
    rojoBuildArgs: ["build", "default.project.json", "-o", DEFAULT_PLACE_FILE],
    watchOnOpen: true,
    generateBlink: true,
    ...rovyConfig,
    ...existingBuild,
  };
  packageJson["rovy-build"] = buildConfig;
  const scripts = (
    isRecord(packageJson.scripts) ? packageJson.scripts : {}
  ) as Record<string, string>;
  for (const [defaultName, scriptName] of Object.entries(
    scriptNames(buildConfig),
  )) {
    if (scripts[scriptName] !== undefined) {
      console.warn(`[rovy-build] overwriting package script '${scriptName}'`);
    }
    scripts[scriptName] = `rovy ${defaultName}`;
  }
  packageJson.scripts = scripts;
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function readConfig(projectDir: string): ResolvedRovyBuildConfig {
  const config = loadRovyBuildConfig(
    projectDir,
    {},
    {
      absolute: (value) => path.resolve(projectDir, value),
      exists: (value) => fs.existsSync(value),
    },
  );
  if (config === undefined) {
    return {
      source: "legacy",
      rootDirectory: projectDir,
      environmentName: undefined,
      environment: {},
      build: {},
    };
  }
  return config;
}

function rbxtscArgs(config: ResolvedRovyBuildConfig): string[] {
  return [
    ...(config.environment.rbxtscArgs ??
      config.build.rbxtscArgs ?? ["--type", "game"]),
  ];
}

function rojoBuildArgs(config: ResolvedRovyBuildConfig): string[] {
  return [
    ...(config.environment.rojoBuildArgs ??
      config.build.rojoBuildArgs ?? [
      "build",
      config.environment.rojo ?? "default.project.json",
      "-o",
      config.environment.placeFile ?? config.build.placeFile ?? DEFAULT_PLACE_FILE,
    ]),
  ];
}

function ensureRojoBuildOutputDir(
  projectDir: string,
  args: readonly string[],
): void {
  const output = rojoBuildOutputPath(args);
  if (output === undefined || output === "-") return;
  const outputDir = path.dirname(path.resolve(projectDir, output));
  if (outputDir !== projectDir) fs.mkdirSync(outputDir, { recursive: true });
}

function rojoBuildOutputPath(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === "-o" || arg === "--output") && args[index + 1] !== undefined)
      return args[index + 1];
    if (arg.startsWith("--output=")) return arg.slice("--output=".length);
  }
  return undefined;
}

function scriptNames(
  config: RovyBuildConfigFile,
): Record<keyof typeof DEFAULT_SCRIPT_NAMES, string> {
  return { ...DEFAULT_SCRIPT_NAMES, ...(config.names ?? {}) };
}

function placeFilePath(
  projectDir: string,
  config: ResolvedRovyBuildConfig,
): string {
  return path.resolve(
    projectDir,
    config.environment.placeFile ?? config.build.placeFile ?? DEFAULT_PLACE_FILE,
  );
}

function requiredNumericConfig(value: unknown, name: string): string {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be a numeric string`);
  return text;
}

function publishVersionType(value: unknown): "Published" | "Saved" {
  if (value === undefined) return "Published";
  if (value === "Published" || value === "Saved") return value;
  throw new Error("rovy-build.publish.versionType must be Published or Saved");
}

function placeFileContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".rbxl") return "application/octet-stream";
  if (ext === ".rbxlx") return "application/xml";
  throw new Error(`unsupported place file extension: ${filePath}`);
}

function publishedVersionNumber(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!isRecord(parsed)) return undefined;
    const version = parsed.versionNumber;
    if (typeof version === "number" || typeof version === "string")
      return String(version);
  } catch {}
  return undefined;
}

function sanitizeResponseBody(body: string, apiKey: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  const redacted = trimmed.split(apiKey).join("<redacted>");
  return redacted.length > 500 ? `${redacted.slice(0, 500)}...` : redacted;
}

function tsBuildInfoPath(projectDir: string): string {
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error)
    return path.join(projectDir, "out", "tsconfig.tsbuildinfo");
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectDir,
  );
  const explicit = parsed.options.tsBuildInfoFile;
  return explicit
    ? path.resolve(projectDir, explicit)
    : path.join(
        path.resolve(projectDir, parsed.options.outDir ?? "out"),
        "tsconfig.tsbuildinfo",
      );
}

function blinkOutputsPresent(projectDir: string): boolean {
  const outDir = outDirPath(projectDir);
  return [
    "rovy.generated.blink",
    "RovyBlinkClient.luau",
    "RovyBlinkServer.luau",
    "RovyBlinkTypes.luau",
  ].every((file) => {
    try {
      return (
        fs.statSync(path.join(outDir, "shared", "net", "generated", file))
          .size > 0
      );
    } catch {
      return false;
    }
  });
}

function outDirPath(projectDir: string): string {
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) return path.join(projectDir, "out");
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectDir,
  );
  return path.resolve(projectDir, parsed.options.outDir ?? "out");
}

function fileMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function runCommand(
  command: string,
  args: readonly string[] = [],
  options: cp.SpawnOptions = {},
): Promise<void> {
  console.log(`[rovy-build] ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, [...args], {
      ...options,
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function publishPlaceVersion(
  request: PublishRequest,
): Promise<PublishResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "x-api-key": request.apiKey,
          "Content-Type": request.contentType,
          "Content-Length": request.body.byteLength,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.once("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.once("error", reject);
    req.end(request.body);
  });
}

async function openFile(filePath: string, run: Runner): Promise<void> {
  if (process.platform === "darwin")
    return run("open", [filePath], { stdio: "inherit" });
  if (process.platform === "win32")
    return run("cmd", ["/c", "start", "", filePath], { stdio: "inherit" });
  return run("xdg-open", [filePath], { stdio: "inherit" });
}

function stateDir(projectDir: string): string {
  const dir = path.join(projectDir, ".rovy-build");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePid(
  projectDir: string,
  name: string,
  pids: readonly number[],
): void {
  fs.writeFileSync(
    path.join(stateDir(projectDir), name),
    `${pids.join("\n")}\n`,
  );
}

function readPids(projectDir: string, name: string): number[] {
  try {
    return fs
      .readFileSync(path.join(stateDir(projectDir), name), "utf8")
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function removePid(projectDir: string, name: string): void {
  fs.rmSync(path.join(stateDir(projectDir), name), { force: true });
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pruneStudioPids(projectDir: string): number[] {
  const pids = readPids(projectDir, "studio.pid").filter(isStudioPid);
  if (pids.length > 0) writePid(projectDir, "studio.pid", pids);
  else removePid(projectDir, "studio.pid");
  return pids;
}

function isStudioPid(pid: number): boolean {
  if (!pidAlive(pid)) return false;
  if (process.platform !== "darwin") return true;
  return studioPids().has(pid);
}

function isTrackedWatchProcess(pid: number): boolean {
  if (!pidAlive(pid)) return false;
  if (process.platform === "win32") return true;
  const result = cp.spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  return /\b(rojo|rbxtsc)\b/.test(result.stdout);
}

async function killPid(pid: number, label: string): Promise<void> {
  if (!pidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  console.log(`[rovy-build] sent SIGTERM to ${label} (pid ${pid})`);
  const exited = await waitForPidExit(pid, 5000);
  if (exited) return;
  console.log(
    `[rovy-build] ${label} (pid ${pid}) did not exit, sending SIGKILL`,
  );
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (!pidAlive(pid)) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

function waitForChildren(
  children: readonly ChildProcess[],
  timeoutMs: number,
): Promise<void> {
  const pending = children.filter(
    (child) => child.exitCode === null && child.signalCode === null,
  );
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = pending.length;
    const timer = setTimeout(resolve, timeoutMs);
    const done = () => {
      remaining -= 1;
      if (remaining === 0) {
        clearTimeout(timer);
        resolve();
      }
    };
    for (const child of pending) {
      child.once("exit", done);
    }
  });
}

function studioPids(): Set<number> {
  const result = cp.spawnSync("pgrep", ["-x", "RobloxStudio"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return new Set();
  return new Set(
    result.stdout.split(/\s+/).map(Number).filter(Number.isInteger),
  );
}

function waitForNewStudioPid(before: Set<number>): number | undefined {
  for (let i = 0; i < 20; i++) {
    const current = studioPids();
    for (const pid of current) {
      if (!before.has(pid)) return pid;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  });
}
