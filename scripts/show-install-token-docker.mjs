import { spawnSync } from "node:child_process";
import path from "node:path";

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });

  if (result.error) {
    console.error(`Unable to run Docker: ${result.error.message}`);
    process.exit(1);
  }

  return result;
}

function normalizedPath(value) {
  const resolved = path.resolve(value).replaceAll("\\", "/").replace(/\/$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

const list = runDocker([
  "ps",
  "-q",
  "--filter",
  "label=com.docker.compose.service=app",
  "--filter",
  "status=running",
]);

if (list.status !== 0) {
  console.error(list.stderr.trim() || "Unable to list running Docker containers.");
  process.exit(1);
}

const containerIds = list.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
if (containerIds.length === 0) {
  console.error("No running Star-API app container was found. Start the platform first.");
  process.exit(1);
}

const inspection = runDocker(["inspect", ...containerIds]);
if (inspection.status !== 0) {
  console.error(inspection.stderr.trim() || "Unable to inspect the app container.");
  process.exit(1);
}

let containers;
try {
  containers = JSON.parse(inspection.stdout);
} catch {
  console.error("Docker returned an invalid container description.");
  process.exit(1);
}

const workingDirectory = normalizedPath(process.cwd());
const appContainers = containers.filter((container) =>
  container?.State?.Running
  && container?.Config?.Labels?.["com.docker.compose.service"] === "app",
);
const projectContainers = appContainers.filter((container) => {
  const projectDirectory = container.Config.Labels["com.docker.compose.project.working_dir"];
  return projectDirectory && normalizedPath(projectDirectory) === workingDirectory;
});

const candidates = projectContainers.length > 0 ? projectContainers : appContainers;
if (candidates.length !== 1) {
  const names = candidates.map((container) => container.Name?.replace(/^\//, "")).filter(Boolean);
  console.error(`Unable to select one app container${names.length ? `: ${names.join(", ")}` : "."}`);
  console.error("Run this command from the matching Star-API project directory.");
  process.exit(1);
}

const result = runDocker([
  "exec",
  candidates[0].Id,
  "node",
  "/app/scripts/show-install-token.mjs",
], { stdio: "inherit", encoding: undefined });

process.exit(result.status ?? 1);
