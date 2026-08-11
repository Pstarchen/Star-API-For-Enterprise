import { readFileSync } from "node:fs";
import path from "node:path";

function deploymentToken() {
  const configured = process.env.INSTALL_TOKEN?.trim();
  if (configured) return configured;

  const secretsDirectory = process.env.STAR_API_SECRETS_DIR?.trim();
  if (!secretsDirectory) return "";

  try {
    return readFileSync(path.join(secretsDirectory, "INSTALL_TOKEN"), "utf8").trim();
  } catch {
    return "";
  }
}

const token = deploymentToken();

if (!token || token.length < 32) {
  console.error("The deployment token is missing or shorter than 32 characters.");
  process.exit(1);
}

let installed;
try {
  const response = await fetch("http://127.0.0.1:3000/api/v1/install", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(3000),
  });
  if (response.ok) {
    const result = await response.json();
    if (typeof result?.data?.installed === "boolean") installed = result.data.installed;
  }
} catch {
  // Fail closed below when the local application cannot confirm its state.
}

if (typeof installed !== "boolean") {
  console.error("Unable to verify installation status. Make sure the app container is healthy.");
  process.exit(1);
}

if (installed) {
  console.error("The platform is already installed. The deployment token is no longer available.");
  process.exit(2);
}

console.log(token);
