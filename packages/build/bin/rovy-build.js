#!/usr/bin/env node
"use strict";

const { runCli } = require("../dist/index.js");

runCli().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
