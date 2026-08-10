const token = process.env.INSTALL_TOKEN?.trim();

if (!token || token.length < 32) {
  console.error("INSTALL_TOKEN is missing or shorter than 32 characters.");
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
