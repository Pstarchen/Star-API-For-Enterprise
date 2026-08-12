export function normalizePackagePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("INVALID_PACKAGE_PATH");
  return normalized;
}

export function resolvePhpEntryFile(paths: readonly string[], requestedEntry = "") {
  const phpFiles = paths.map(normalizePackagePath).filter((path) => path.toLowerCase().endsWith(".php"));
  if (!phpFiles.length) throw new Error("PHP_ENTRY_NOT_FOUND");

  const hasRequestedEntry = Boolean(requestedEntry.trim());
  const requested = hasRequestedEntry ? normalizePackagePath(requestedEntry.trim()) : "index.php";
  if (!requested.toLowerCase().endsWith(".php")) throw new Error("INVALID_PHP_ENTRY");
  const exact = phpFiles.find((path) => path === requested);
  if (exact) return exact;
  const caseInsensitive = phpFiles.filter((path) => path.toLowerCase() === requested.toLowerCase());
  if (caseInsensitive.length === 1) return caseInsensitive[0];

  // A path containing a directory is an explicit selection. Falling back to
  // another folder's same-named file could execute the wrong application.
  if (hasRequestedEntry && requested.includes("/")) throw new Error(`PHP_ENTRY_NOT_FOUND:${requested}`);

  const requestedName = requested.split("/").at(-1)!.toLowerCase();
  const sameName = phpFiles.filter((path) => path.split("/").at(-1)!.toLowerCase() === requestedName);
  if (sameName.length === 1) return sameName[0];
  if (sameName.length > 1) throw new Error(`PHP_ENTRY_AMBIGUOUS:${sameName.slice(0, 5).join("|")}`);
  if (hasRequestedEntry) throw new Error(`PHP_ENTRY_NOT_FOUND:${requested}`);

  if (phpFiles.length === 1) return phpFiles[0];
  for (const commonName of ["index.php", "api.php", "main.php", "app.php"]) {
    const candidates = phpFiles.filter((path) => path.split("/").at(-1)!.toLowerCase() === commonName);
    if (candidates.length === 1) return candidates[0];
  }
  throw new Error(`PHP_ENTRY_AMBIGUOUS:${phpFiles.slice(0, 5).join("|")}`);
}
