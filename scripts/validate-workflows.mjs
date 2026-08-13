import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

const workflowPath = resolve(".github/workflows/deploy-production.yml");
const workflow = YAML.parse(readFileSync(workflowPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(workflow?.name === "Deploy production", "Unexpected production workflow name");
assert(workflow?.on?.workflow_dispatch, "Production workflow must be manually dispatched");
assert(workflow?.permissions?.contents === "read", "Production workflow must only request read access to repository contents");
assert(workflow?.jobs?.deploy?.environment === "production", "Production workflow must use the protected production environment");
assert(workflow?.jobs?.deploy?.concurrency == null, "Concurrency must be defined at workflow scope");
assert(Array.isArray(workflow?.jobs?.deploy?.steps), "Production deployment steps are missing");

const checkout = workflow.jobs.deploy.steps.find((step) => step.uses === "actions/checkout@v4");
assert(checkout?.with?.["fetch-depth"] === 0, "Production checkout must fetch release tags");

const scripts = workflow.jobs.deploy.steps.filter((step) => typeof step.run === "string");
assert(scripts.length >= 5, "Expected production validation, deployment, health and cleanup scripts");

const bash = spawnSync("bash", ["--version"], { encoding: "utf8" });
if (bash.status === 0) {
  for (const step of scripts) {
    const syntax = spawnSync("bash", ["-n"], { input: step.run, encoding: "utf8" });
    assert(syntax.status === 0, `Invalid Bash in workflow step "${step.name}":\n${syntax.stderr}`);
  }
  console.log(`Validated production workflow structure and ${scripts.length} Bash steps.`);
} else {
  console.log("Validated production workflow structure. Bash syntax validation is deferred to Linux CI.");
}
