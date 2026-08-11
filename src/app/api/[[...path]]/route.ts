import { handlePublicGateway } from "@/lib/server/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request, context: RouteContext<"/api/[[...path]]">) {
  return context.params.then(({ path = [] }) => handlePublicGateway(request, `/api/${path.join("/")}`.replace(/\/$/, "")));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
