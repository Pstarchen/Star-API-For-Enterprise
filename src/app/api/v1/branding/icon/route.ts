import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const asset = await prisma.platformAsset.findUnique({ where: { key: "site-icon" } });
  if (!asset) return new Response(null, { status: 404 });

  const etag = `"${asset.updatedAt.getTime()}-${asset.data.length}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.data.length),
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
