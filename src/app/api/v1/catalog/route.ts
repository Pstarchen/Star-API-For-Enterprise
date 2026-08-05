import { apiProducts } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().toLowerCase();
  const category = searchParams.get("category");
  const method = searchParams.get("method");

  const data = apiProducts.filter((api) => {
    if (category && category !== "全部" && api.category !== category) return false;
    if (method && api.method !== method.toUpperCase()) return false;
    if (query && ![api.name, api.description, api.provider, ...api.tags].join(" ").toLowerCase().includes(query)) return false;
    return true;
  });

  return Response.json({ data, meta: { total: data.length, requestId: crypto.randomUUID() } });
}
