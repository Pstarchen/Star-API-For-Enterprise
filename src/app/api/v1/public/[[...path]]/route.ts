import { handlePublicGateway } from "@/lib/server/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request, context: RouteContext<"/api/v1/public/[[...path]]">) {
  return context.params.then(({ path = [] }) => handlePublicGateway(request, `/${path.join("/")}`));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
