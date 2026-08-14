import type { Prisma } from "@prisma/client";
import { authenticateDirectLink } from "@/lib/server/direct-link";
import { handlePublicGateway, type GatewayPrincipal } from "@/lib/server/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function directLinkHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function defaultParameters(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function GET(request: Request, context: RouteContext<"/l/[token]">) {
  const { token } = await context.params;
  let link: Awaited<ReturnType<typeof authenticateDirectLink>>;
  try {
    link = await authenticateDirectLink(token);
  } catch {
    return directLinkHeaders(Response.json({ code: "DIRECT_LINK_UNAVAILABLE", message: "直链服务暂不可用" }, { status: 503 }));
  }
  if (!link) return directLinkHeaders(Response.json({ code: "DIRECT_LINK_INVALID", message: "直链无效、已过期或已撤销" }, { status: 404 }));

  const principal: GatewayPrincipal = {
    appId: link.subscription.appId,
    apiKeyId: null,
    directLinkId: link.id,
    scopes: [`api:${link.endpoint.version.product.slug}`],
    app: link.subscription.app,
  };
  const response = await handlePublicGateway(request, link.endpoint.publicPath, {
    principal,
    endpointId: link.endpointId,
    subscriptionId: link.subscriptionId,
    defaultParameters: defaultParameters(link.defaultParameters),
  });
  return directLinkHeaders(response);
}
