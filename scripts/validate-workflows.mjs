import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

const workflowPath = resolve(".github/workflows/deploy-production.yml");
const workflow = YAML.parse(readFileSync(workflowPath, "utf8"));
const ciWorkflow = YAML.parse(readFileSync(resolve(".github/workflows/ci.yml"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(workflow?.name === "Deploy production", "Unexpected production workflow name");
assert(workflow?.on?.workflow_dispatch, "Production workflow must be manually dispatched");
assert(workflow?.permissions?.contents === "read", "Production workflow must only request read access to repository contents");
assert(workflow?.permissions?.packages === "read", "Production workflow must only read release packages");
assert(workflow?.jobs?.deploy?.environment === "production", "Production workflow must use the protected production environment");
assert(workflow?.jobs?.deploy?.concurrency == null, "Concurrency must be defined at workflow scope");
assert(Array.isArray(workflow?.jobs?.deploy?.steps), "Production deployment steps are missing");
assert(Array.isArray(ciWorkflow?.jobs?.quality?.steps), "CI quality steps are missing");
const qualityCommands = ciWorkflow.jobs.quality.steps.map((step) => step.run).filter(Boolean);
assert(qualityCommands.includes("npm run test:image-signature"), "CI must test tolerant image signature detection");
assert(qualityCommands.includes("npm run test:php-package"), "CI must test PHP package entry discovery");
assert(qualityCommands.includes("npm run test:upstream"), "CI must test external upstream URL handling");
assert(qualityCommands.includes("npm run test:system-update"), "CI must test host-local system updates");
assert(qualityCommands.includes("npm run test:local-update-worker"), "CI must test the host-local update worker");
const containerNames = ciWorkflow?.jobs?.container?.strategy?.matrix?.include?.map((item) => item.name) ?? [];
assert(containerNames.includes("app") && containerNames.includes("php-runner"), "CI must build both app and PHP runner images");

const checkout = workflow.jobs.deploy.steps.find((step) => step.uses === "actions/checkout@v5");
assert(checkout?.with?.["fetch-depth"] === 0, "Production checkout must fetch release tags");

const scripts = workflow.jobs.deploy.steps.filter((step) => typeof step.run === "string");
assert(scripts.length >= 5, "Expected production validation, deployment, health and cleanup scripts");

const deployScript = workflow.jobs.deploy.steps.find((step) => step.name === "Inspect and update production")?.run ?? "";
assert(deployScript.includes('docker pull --platform "$remote_platform"'), "Production deploy must pull the matching image architecture on the server");
assert(deployScript.includes('docker manifest inspect "$image"'), "Production deploy must inspect the official release manifest");
assert(deployScript.includes('.platform.architecture == $architecture'), "Production deploy must resolve the matching platform digest");
assert(deployScript.includes('proxy_ref="${proxy}/${image#ghcr.io/}@${official_digest}"'), "Production deploy proxy pulls must use the official digest");
assert(deployScript.includes('docker tag "$proxy_ref" "$image"'), "Production deploy must tag verified proxy images with the official name");
assert(!deployScript.includes('docker save "${release_images[@]}"'), "Production deploy must not stream large image archives over SSH");
assert(deployScript.includes('process-local-update.sh'), "Production deploy must install the host-local update worker");
assert(deployScript.includes('bash "$payload_dir/production.sh" enable-updates'), "Production deploy must enable host-local updates");
assert(deployScript.includes('bash "$payload_dir/update-production.sh" --check "$version" </dev/null'), "Production preflight must not consume the remote script stream");
assert(deployScript.includes('bash "$payload_dir/update-production.sh" "$version" </dev/null'), "Production update must not consume the remote script stream");
assert(deployScript.includes('"$remote_payload" "$PRODUCTION_IMAGE_PROXIES"'), "Production deploy must pass image proxies into the remote script");
assert(deployScript.includes('STAR_API_DEFAULT_IMAGE_PROXIES="$image_proxies"'), "Remote update setup must use the validated proxy argument");
assert(deployScript.includes('"$PRODUCTION_IMAGE_PROXIES" "$PRODUCTION_UPDATE_REGION"'), "Production deploy must pass the update region into the remote script");
assert(deployScript.includes('STAR_API_DEFAULT_UPDATE_REGION="$update_region"'), "Remote update setup must persist the validated update region");
assert(deployScript.includes('Pulling $image directly from GHCR'), "Global deployments must prefer official GHCR images");
assert(deployScript.includes('Domestic mirrors failed; falling back to official GHCR'), "Domestic deployments must retain an official GHCR fallback");
assert(deployScript.includes('systemctl is-active --quiet star-api-local-update.path'), "Production deploy must verify the local update watcher");
assert(deployScript.includes('(cd /tmp && star-api doctor)'), "Production deploy must verify the directory-independent management command");
assert(deployScript.includes('PHP Runner GD, JPEG, FreeType and EXIF: ready'), "Production deploy must verify PHP image extensions");

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
