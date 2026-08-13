export function upstreamHealthTarget(baseUrl: string, healthPath: string) {
  const base = new URL(baseUrl);
  const normalizedPath = healthPath.trim();

  // A fixed external API is commonly entered as the complete URL, including
  // its required query. The default "/" means "use that URL", not the origin.
  if (!normalizedPath || normalizedPath === "/") return base;

  const target = new URL(base.toString());
  target.pathname = `${base.pathname.replace(/\/+$/, "")}/${normalizedPath.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  target.search = "";
  target.hash = "";
  return target;
}

export function mergeUpstreamQuery(target: URL, query: string) {
  if (!query) return target;
  const incoming = new URLSearchParams(query);
  for (const name of new Set(incoming.keys())) target.searchParams.delete(name);
  for (const [name, value] of incoming) target.searchParams.append(name, value);
  return target;
}
