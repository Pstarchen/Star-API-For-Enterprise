export async function GET() {
  return Response.json({ status: "ok", service: "star-api-platform", version: "0.1.0", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
