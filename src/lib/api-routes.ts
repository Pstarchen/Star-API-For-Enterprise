const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function shortHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

export function apiSlugFromName(name: string) {
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  if (slugPattern.test(ascii) && ascii.length >= 2) return ascii;
  return `api-${shortHash(name.trim() || "star-api")}`;
}

export function normalizePublicHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function normalizePublicPath(value: string) {
  const withLeadingSlash = value.trim().startsWith("/") ? value.trim() : `/${value.trim()}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  return collapsed.replace(/\/+$/, "") || "/";
}

export function routePatternKey(value: string) {
  return normalizePublicPath(value)
    .split("/")
    .map((segment) => /^\{[^/{}]+\}$/.test(segment) ? "{}" : segment)
    .join("/");
}

export function routeStaticSegmentCount(value: string) {
  return normalizePublicPath(value).split("/").filter((segment) => segment && !/^\{[^/{}]+\}$/.test(segment)).length;
}
