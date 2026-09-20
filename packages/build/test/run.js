const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { planRojoServe, runCli } = require("../dist/index.js");

function tempProject(config = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rovy-build-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "fixture",
      scripts: {},
      "rovy-build": {
        current: "dev",
        placeFile: "game.rbxl",
        rbxtscArgs: ["--type", "game"],
        rojoBuildArgs: ["build", "default.project.json", "-o", "game.rbxl"],
        environments: { dev: { rojo: "default.project.json" } },
        ...config,
      },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { rootDir: "src", outDir: "out" },
      include: ["src"],
    }),
  );
  fs.mkdirSync(path.join(dir, "src"));
  return dir;
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function capture(argv, dir) {
  const calls = [];
  await runCli(argv, {
    projectDir: dir,
    run: async (command, args = []) => {
      calls.push([command, [...args]]);
    },
  });
  return calls;
}

(async () => {
  const buildDir = tempProject({ generateBlink: false });
  assert.deepEqual(await capture(["compile"], buildDir), [
    ["rbxtsc", ["--type", "game"]],
  ]);
  assert.deepEqual(await capture(["build"], buildDir), [
    ["rbxtsc", ["--type", "game"]],
    ["rojo", ["build", "default.project.json", "-o", "game.rbxl"]],
  ]);

  const nestedBuildDir = tempProject({
    generateBlink: false,
    placeFile: "build/game.rbxl",
    rojoBuildArgs: ["build", "default.project.json", "-o", "build/game.rbxl"],
  });
  assert.deepEqual(await capture(["build"], nestedBuildDir), [
    ["rbxtsc", ["--type", "game"]],
    ["rojo", ["build", "default.project.json", "-o", "build/game.rbxl"]],
  ]);
  assert.equal(fs.existsSync(path.join(nestedBuildDir, "build")), true);

  const partitionDir = tempProject({ generateBlink: false });
  const pluginDir = path.join(partitionDir, "src", "plugins", "combat");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, ".rovy.plugin.json"), "{}");
  fs.writeFileSync(
    path.join(pluginDir, "index.ts"),
    [
      "declare function shared(target: object): void;",
      "declare function component(target: object): void;",
      "@shared",
      "@component",
      "export class Clock {}",
    ].join("\n"),
  );
  const partitionCalls = await capture(["compile"], partitionDir);
  assert.equal(partitionCalls.length, 1);
  assert.equal(partitionCalls[0][0], "rbxtsc");
  assert.equal(partitionCalls[0][1][0], "-p");
  assert.equal(
    path.basename(partitionCalls[0][1][1]),
    "partitioned.tsconfig.json",
  );
  assert.equal(
    fs.existsSync(
      path.join(
        partitionDir,
        ".rovy-build",
        "partitioned-src",
        "plugins",
        "combat",
        "shared",
        "index.ts",
      ),
    ),
    true,
  );

  const envOverrideDir = tempProject({
    generateBlink: false,
    rojoBuildArgs: undefined,
    environments: {
      lobby: {
        rojo: "projects/lobby/default.project.json",
        placeFile: "build/lobby.rbxl",
        rbxtscArgs: ["-p", "projects/lobby", "--type", "game"],
      },
    },
    current: "lobby",
  });
  assert.deepEqual(await capture(["build"], envOverrideDir), [
    ["rbxtsc", ["-p", "projects/lobby", "--type", "game"]],
    [
      "rojo",
      ["build", "projects/lobby/default.project.json", "-o", "build/lobby.rbxl"],
    ],
  ]);
  assert.equal(fs.existsSync(path.join(envOverrideDir, "build")), true);

  const portDir = tempProject({ generateBlink: false, rojoPort: 41234 });
  assert.deepEqual(await planRojoServe(portDir), {
    args: ["serve", "default.project.json", "--port", "41234"],
    port: 41234,
  });
  assert.equal((await planRojoServe(portDir, 41235)).port, 41235);

  process.env.ROVY_ROJO_PORT = "41236";
  assert.equal((await planRojoServe(portDir)).port, 41236);
  delete process.env.ROVY_ROJO_PORT;

  const envPortDir = tempProject({
    generateBlink: false,
    rojoPort: 41234,
    current: "dev",
    environments: { dev: { rojo: "default.project.json", rojoPort: "auto" } },
  });
  const autoPort = (await planRojoServe(envPortDir)).port;
  assert.ok(autoPort >= 34872 && autoPort < 34872 + 64, `auto port ${autoPort}`);

  const taken = await listen(autoPort);
  try {
    assert.ok((await planRojoServe(envPortDir)).port > autoPort);
    await assert.rejects(
      planRojoServe(portDir, autoPort),
      new RegExp(`rojo port ${autoPort} is already in use`),
    );
  } finally {
    await close(taken);
  }

  await assert.rejects(
    runCli(["watch", "--port", "nope"], { projectDir: portDir, run: async () => {} }),
    /--port expects a port number or 'auto'/,
  );
  await assert.rejects(
    runCli(["build", "--oops"], { projectDir: portDir, run: async () => {} }),
    /unexpected rovy-build argument: --oops/,
  );

  const initDir = fs.mkdtempSync(path.join(os.tmpdir(), "rovy-build-init-"));
  fs.writeFileSync(
    path.join(initDir, "package.json"),
    JSON.stringify({ name: "fixture", scripts: {} }),
  );
  fs.writeFileSync(
    path.join(initDir, ".rovy.json"),
    JSON.stringify({
      current: "dev",
      environments: { dev: { rojo: "default.project.json" } },
    }),
  );
  await runCli(["init"], { projectDir: initDir, run: async () => {} });
  const pkg = JSON.parse(
    fs.readFileSync(path.join(initDir, "package.json"), "utf8"),
  );
  assert.equal(pkg["rovy-build"].current, "dev");
  assert.equal(pkg.scripts.build, "rovy build");
  assert.equal(pkg.scripts.generate, "rovy generate");

  function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.exitCode = null;
    child.signalCode = null;
    return child;
  }

  function waitFor(predicate, timeout = 2000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (predicate()) {
          resolve();
          return;
        }
        if (Date.now() - start >= timeout) {
          reject(new Error("timed out waiting"));
          return;
        }
        setImmediate(tick);
      };
      tick();
    });
  }

  function startWatch(dir) {
    const order = [];
    const children = new Map();
    const spawn = (command) => {
      order.push(command);
      const child = fakeChild();
      const list = children.get(command) ?? [];
      list.push(child);
      children.set(command, list);
      return child;
    };
    const promise = runCli(["watch"], {
      projectDir: dir,
      run: async () => {},
      spawn,
    });
    const stopChildren = () => {
      for (const list of children.values()) {
        for (const child of list) child.exitCode = 0;
      }
      for (const list of children.values()) {
        for (const child of list) child.emit("exit", 0);
      }
    };
    return { order, children, promise, stopChildren };
  }

  {
    const dir = tempProject({ generateBlink: false });
    const { order, children, promise, stopChildren } = startWatch(dir);
    await waitFor(() => order.includes("rbxtsc"));
    assert.equal(order.includes("rojo"), false);
    const compiler = children.get("rbxtsc")[0];
    compiler.stdout.emit("data", "Found ");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(order.includes("rojo"), false);
    compiler.stdout.emit("data", "0 errors.\n");
    await waitFor(() => order.includes("rojo"));
    assert.equal(order[0], "rbxtsc");
    assert.ok(order.indexOf("rbxtsc") < order.indexOf("rojo"));
    stopChildren();
    await promise;
  }

  {
    const dir = tempProject({ generateBlink: false });
    const { order, children, promise, stopChildren } = startWatch(dir);
    await waitFor(() => order.includes("rbxtsc"));
    assert.equal(order.includes("rojo"), false);
    children.get("rbxtsc")[0].stdout.emit("data", "Found 0 errors.\n");
    await waitFor(() => order.includes("rojo"));
    stopChildren();
    await promise;
  }

  {
    const dir = tempProject({ generateBlink: false });
    const { order, children, promise } = startWatch(dir);
    await waitFor(() => order.includes("rbxtsc"));
    const compiler = children.get("rbxtsc")[0];
    compiler.exitCode = 1;
    compiler.emit("exit", 1);
    await assert.rejects(
      promise,
      /rbxtsc watch exited before its initial compilation completed/,
    );
    assert.equal(order.includes("rojo"), false);
  }

  {
    const dir = tempProject({ generateBlink: true });
    const pluginDir = path.join(dir, "src", "plugins", "combat");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, ".rovy.plugin.json"), "{}");
    fs.writeFileSync(
      path.join(pluginDir, "index.ts"),
      [
        "declare function shared(target: object): void;",
        "declare function component(target: object): void;",
        "@shared",
        "@component",
        "export class Clock {}",
      ].join("\n"),
    );
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    const { order, children, promise, stopChildren } = startWatch(dir);
    await waitFor(() => order.includes("rbxtsc"));
    assert.equal(order.includes("rojo"), false);
    children.get("rbxtsc")[0].stdout.emit("data", "Found 0 errors.\n");
    await waitFor(() => order.includes("rojo"));
    assert.equal(order[0], "rbxtsc");
    const facade = path.join(dir, "out", "plugins", "combat", "init.luau");
    assert.equal(fs.existsSync(facade), true);
    const before = fs.statSync(facade).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(fs.statSync(facade).mtimeMs, before);
    stopChildren();
    await promise;
  }

  console.log("rovy-build tests OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
