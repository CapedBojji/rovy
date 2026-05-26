const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runCli } = require("../dist/index.js");

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
    JSON.stringify({ compilerOptions: { outDir: "out" }, include: ["src"] }),
  );
  fs.mkdirSync(path.join(dir, "src"));
  return dir;
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

  console.log("rovy-build tests OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
