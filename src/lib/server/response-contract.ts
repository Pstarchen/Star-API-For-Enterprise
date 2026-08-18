import "server-only";

import { Prisma } from "@prisma/client";
import { deriveResponseContractChanges, inferResponseContract } from "@/lib/response-contract";
import { prisma } from "@/lib/server/prisma";

const maxObservedBytes = 256 * 1024;

// Read a bounded clone so documenting a text response never consumes the response returned to the caller.
async function readTextResponse(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxObservedBytes) return null;
  if (!response.body) return "";
  const reader = response.clone().body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxObservedBytes) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const declaredType = response.headers.get("content-type") ?? "";
  const charset = declaredType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder().decode(bytes); }
}

export async function observeEndpointResponse(input: {
  endpointId: string;
  response: Response;
  statusCode: number;
  requestMethod?: string;
}) {
  if (input.requestMethod === "HEAD" || input.statusCode === 204 || input.statusCode === 205) return false;
  const contentType = (input.response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const isBinary = contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.startsWith("audio/") || contentType.includes("pdf") || contentType.includes("zip") || contentType.includes("gzip");
  const text = isBinary ? "" : await readTextResponse(input.response);
  if (text === null) return false;
  const observed = inferResponseContract({ body: text, contentType });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const endpoint = await transaction.endpoint.findUnique({ where: { id: input.endpointId }, include: { responseParameters: { orderBy: { sortOrder: "asc" } } } });
        if (!endpoint) return false;
        const changes = deriveResponseContractChanges({ endpointSchema: endpoint.schema, responseExample: endpoint.responseExample, responseFormats: endpoint.responseFormats, responseParameters: endpoint.responseParameters, observed, statusCode: input.statusCode });
        if (!changes.shouldWrite) return false;
        const updateData: Prisma.EndpointUpdateInput = {
          ...(changes.schemaChanged || changes.formatsChanged || changes.exampleChanged ? { schema: changes.nextSchema as Prisma.InputJsonValue } : {}),
          ...(changes.formatsChanged ? { responseFormats: changes.nextFormats } : {}),
          ...(changes.parameterChanged ? { responseParameters: { deleteMany: {}, create: changes.mergedParameters.map(({ name, dataType, description }, sortOrder) => ({ name, dataType, description, sortOrder })) } } : {}),
        };
        if (changes.success && (changes.schemaChanged || changes.formatsChanged || changes.missingExample || changes.exampleChanged)) updateData.responseExample = observed.example === null ? Prisma.JsonNull : observed.example as Prisma.InputJsonValue;
        await transaction.endpoint.update({ where: { id: endpoint.id }, data: updateData });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  return false;
}
