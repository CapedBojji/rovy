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

async function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function capturePublish(dir, options = {}) {
  const requests = [];
  const response = options.response ?? { statusCode: 200, body: '{"versionNumber":7}' };
  await withEnv(options.env ?? { ROBLOX_API_KEY: "test-key" }, async () => {
    await runCli(["publish"], {
      projectDir: dir,
      run: async () => {},
      publishRequest: async (request) => {
        requests.push({ ...request, body: Buffer.from(request.body) });
        return typeof response === "function" ? response(request) : response;
      },
    });
  });
  return requests;
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

  const publishDir = tempProject({
    generateBlink: false,
    publish: {
      universeId: "10335309698",
      placeId: "107039625110623",
      versionType: "Published",
    },
  });
  fs.writeFileSync(path.join(publishDir, "game.rbxl"), Buffer.from([1, 2, 3]));
  const publishRequests = await capturePublish(publishDir);
  assert.equal(publishRequests.length, 1);
  assert.equal(
    publishRequests[0].url,
    "https://apis.roblox.com/universes/v1/10335309698/places/107039625110623/versions?versionType=Published",
  );
  assert.equal(publishRequests[0].apiKey, "test-key");
  assert.equal(publishRequests[0].contentType, "application/octet-stream");
  assert.deepEqual([...publishRequests[0].body], [1, 2, 3]);

  const xmlPublishDir = tempProject({
    generateBlink: false,
    placeFile: "game.rbxlx",
    publish: {
      universeId: "10",
      placeId: "20",
      versionType: "Published",
    },
  });
  fs.writeFileSync(path.join(xmlPublishDir, "game.rbxlx"), "<roblox />");
  const xmlPublishRequests = await capturePublish(xmlPublishDir, {
    env: {
      ROBLOX_API_KEY: undefined,
      ROBLOX_OPEN_CLOUD_API_KEY: "fallback-key",
    },
  });
  assert.equal(xmlPublishRequests[0].apiKey, "fallback-key");
  assert.equal(xmlPublishRequests[0].contentType, "application/xml");
  assert.equal(xmlPublishRequests[0].body.toString("utf8"), "<roblox />");

  const noPublishDir = tempProject({ generateBlink: false });
  fs.writeFileSync(path.join(noPublishDir, "game.rbxl"), "place");
  await assert.rejects(
    runCli(["publish"], {
      projectDir: noPublishDir,
      run: async () => {},
      publishRequest: async () => {
        throw new Error("publishRequest should not be called");
      },
    }),
    /rovy-build\.publish is required/,
  );

  const noKeyDir = tempProject({
    generateBlink: false,
    publish: {
      universeId: "10",
      placeId: "20",
      versionType: "Published",
    },
  });
  fs.writeFileSync(path.join(noKeyDir, "game.rbxl"), "place");
  await assert.rejects(
    withEnv(
      { ROBLOX_API_KEY: undefined, ROBLOX_OPEN_CLOUD_API_KEY: undefined },
      () =>
        runCli(["publish"], {
          projectDir: noKeyDir,
          run: async () => {},
          publishRequest: async () => {
            throw new Error("publishRequest should not be called");
          },
        }),
    ),
    /ROBLOX_API_KEY is required/,
  );

  const secret = "secret-publish-key";
  await assert.rejects(
    withEnv(
      { ROBLOX_API_KEY: secret, ROBLOX_OPEN_CLOUD_API_KEY: undefined },
      () =>
        runCli(["publish"], {
          projectDir: publishDir,
          run: async () => {},
          publishRequest: async () => ({
            statusCode: 403,
            body: `denied ${secret}`,
          }),
        }),
    ),
    (error) => {
      assert.match(error.message, /place publish failed \(403\): denied <redacted>/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
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
  assert.equal(pkg.scripts.publish, "rovy publish");

  console.log("rovy-build tests OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
