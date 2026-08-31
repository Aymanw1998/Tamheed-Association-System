#!/usr/bin/env node
// One-command project setup: installs dependencies in root/client/server
// and creates local .env files from their .env.example templates.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function run(command, args, cwd) {
  console.log(`\n> [${path.relative(ROOT, cwd) || "."}] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`Command failed in ${cwd}: ${command} ${args.join(" ")}`);
    process.exit(result.status || 1);
  }
}

function ensureEnvFile(dir, exampleName, envName) {
  const examplePath = path.join(dir, exampleName);
  const envPath = path.join(dir, envName);

  if (!fs.existsSync(examplePath)) {
    console.warn(`Skipped (no ${exampleName} found): ${dir}`);
    return;
  }

  if (fs.existsSync(envPath)) {
    console.log(`Already exists, left untouched: ${path.relative(ROOT, envPath)}`);
    return;
  }

  fs.copyFileSync(examplePath, envPath);
  console.log(`Created ${path.relative(ROOT, envPath)} from ${exampleName} - fill in real values before running the app.`);
}

console.log("== Tamheed setup ==");

run("npm", ["install"], ROOT);
run("npm", ["install"], path.join(ROOT, "client"));
run("npm", ["install"], path.join(ROOT, "server"));

console.log("\n== Environment files ==");
ensureEnvFile(path.join(ROOT, "server", "config"), ".env.example", ".env");
ensureEnvFile(path.join(ROOT, "client"), ".env.example", ".env");

console.log("\nSetup complete.");
console.log("Next steps:");
console.log("  1. Fill in real values in server/config/.env and client/.env");
console.log("  2. Run \"npm start\" from the repo root to launch client + server together");
