import { listCatalogProducts } from "@/lib/server/catalog";
import { noStoreHeaders } from "@/lib/server/request";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const query = search.get("q")?.trim().toLowerCase();
  const category = search.get("category");
  const method = search.get("method")?.toUpperCase();
  const products = await listCatalogProducts({ status: "PUBLISHED" });
  const data = products.filter((api) => (!category || api.category === category) && (!method || api.methods.includes(method)) && (!query || [api.name, api.description, api.provider, ...api.tags].join(" ").toLowerCase().includes(query)));
  return Response.json({ data, meta: { total: data.length, requestId: crypto.randomUUID() } }, { headers: noStoreHeaders });
}
