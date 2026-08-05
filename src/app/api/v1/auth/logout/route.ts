import { destroyCurrentSession } from "@/lib/server/auth";
import { noStoreHeaders } from "@/lib/server/request";

export async function POST() {
  await destroyCurrentSession();
  return new Response(null, { status: 204, headers: noStoreHeaders });
}
