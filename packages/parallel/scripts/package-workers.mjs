import { mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
mkdirSync("worker", { recursive: true });
writeFileSync("worker/package.json", JSON.stringify({ main: "../out/worker.luau", types: "../out/worker.d.ts" }) + "\n");
for (const side of ["server", "client"]) {
  mkdirSync(`out/templates/${side}`, { recursive: true });
  const name = `worker.${side}.luau`;
  copyFileSync("src/templates/worker.luau", `out/templates/${side}/${name}`);
  writeFileSync(`out/templates/${side}/worker.meta.json`, JSON.stringify({ properties: { Disabled: true } }) + "\n");
}
for (const name of ["pool", "transport", "kernel"]) copyFileSync(`src/${name}.luau`, `out/${name}.luau`);
rmSync("out/templates/worker.luau", { force: true });
