import type { ApiDataType, ApiResponseFormat } from "@/lib/api-contracts";

export type ResponseParameterShape = { id?: string; name: string; dataType: string; description: string };

export type ObservedResponseContract = {
  statusCode?: number;
  format: ApiResponseFormat;
  contentType: string;
  example: unknown;
  responseParameters: Array<{ name: string; dataType: ApiDataType; description: string }>;
  schema: Record<string, unknown>;
};

const maxObjectProperties = 100;
const maxArrayItems = 20;
const maxSchemaDepth = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function responseValuesEqual(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

function mediaType(contentType: string) {
  return contentType.split(";", 1)[0].trim().toLowerCase();
}

function isTextContentType(contentType: string) {
  return !contentType || contentType.startsWith("text/") || contentType.includes("xml") || contentType.includes("javascript") || contentType.includes("x-www-form-urlencoded");
}

export function inferApiDataType(value: unknown): ApiDataType {
  if (Array.isArray(value)) return "array";
  if (isRecord(value)) return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return "string";
}

function jsonSchema(value: unknown, depth = 0): Record<string, unknown> {
  if (depth >= maxSchemaDepth) return {};
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const sample = value.slice(0, maxArrayItems).find((item) => item !== null && item !== undefined);
    return { type: "array", items: sample === undefined ? {} : jsonSchema(sample, depth + 1) };
  }
  if (isRecord(value)) {
    const properties = Object.fromEntries(Object.entries(value).slice(0, maxObjectProperties).map(([name, item]) => [name, jsonSchema(item, depth + 1)]));
    return { type: "object", properties, required: Object.keys(properties) };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  return { type: "string" };
}

function responseParameters(value: unknown) {
  if (isRecord(value)) {
    return Object.entries(value).slice(0, maxObjectProperties).map(([name, item]) => ({ name, dataType: inferApiDataType(item), description: "" }));
  }
  if (Array.isArray(value)) return [{ name: "items", dataType: "array" as const, description: "返回数据集合" }];
  return [{ name: "value", dataType: inferApiDataType(value), description: "接口返回值" }];
}

function parseJson(text: string) {
  try { return { parsed: true, value: JSON.parse(text) as unknown }; }
  catch { return { parsed: false, value: text }; }
}

export function inferResponseContract(input: { body: string; contentType?: string | null; statusCode?: number }): ObservedResponseContract {
  const declaredType = (input.contentType ?? "").trim().toLowerCase();
  const declaredMediaType = mediaType(declaredType);
  const parsed = parseJson(input.body);
  const isJson = declaredType.includes("json") || ((!declaredType || declaredMediaType === "application/octet-stream") && parsed.parsed);
  if (isJson && parsed.parsed) {
    return {
      statusCode: input.statusCode,
      format: "JSON",
      contentType: declaredMediaType || "application/json",
      example: parsed.value,
      responseParameters: responseParameters(parsed.value),
      schema: jsonSchema(parsed.value),
    };
  }
  if (declaredType.includes("json")) {
    return {
      statusCode: input.statusCode,
      format: "JSON",
      contentType: declaredMediaType || "application/json",
      example: input.body,
      responseParameters: [],
      schema: { type: "string", contentType: declaredMediaType || "application/json", description: "响应声明为 JSON，但内容不是有效 JSON" },
    };
  }
  if (isTextContentType(declaredType)) {
    return {
      statusCode: input.statusCode,
      format: "TXT",
      contentType: declaredMediaType || "text/plain",
      example: input.body,
      responseParameters: [],
      schema: { type: "string", contentType: declaredMediaType || "text/plain" },
    };
  }
  return {
    statusCode: input.statusCode,
    format: "BINARY",
    contentType: declaredMediaType || "application/octet-stream",
    example: null,
    responseParameters: [],
    schema: { type: "string", format: "binary", contentType: declaredMediaType || "application/octet-stream" },
  };
}

// Runtime responses can expose different fields for different request parameters; keep one union schema.
function mergedSchema(current: unknown, observed: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(current)) return observed;
  if (current.type === "object" && observed.type === "object") {
    const currentProperties = isRecord(current.properties) ? current.properties : {};
    const observedProperties = isRecord(observed.properties) ? observed.properties : {};
    const properties: Record<string, unknown> = { ...currentProperties };
    for (const [name, schema] of Object.entries(observedProperties)) properties[name] = isRecord(schema) ? mergedSchema(currentProperties[name], schema) : schema;
    const currentRequired = Array.isArray(current.required) ? current.required.filter((item): item is string => typeof item === "string") : [];
    const observedRequired = new Set(Array.isArray(observed.required) ? observed.required.filter((item): item is string => typeof item === "string") : []);
    const required = currentRequired.filter((name) => observedRequired.has(name));
    return { ...current, ...observed, properties, ...(required.length ? { required } : { required: [] }) };
  }
  if (current.type === "array" && observed.type === "array" && isRecord(observed.items)) return { ...current, ...observed, items: mergedSchema(current.items, observed.items) };
  if (current.type === observed.type) return { ...current, ...observed };
  const alternatives = Array.isArray(current.anyOf) ? current.anyOf : [current];
  return alternatives.some((item) => JSON.stringify(item) === JSON.stringify(observed)) ? current : { anyOf: [...alternatives, observed] };
}

export function mergeResponseSchema(existing: unknown, observed: ObservedResponseContract, statusCode: number) {
  const root = isRecord(existing) ? existing : {};
  const responses = isRecord(root.responses) ? root.responses : {};
  const statusKey = String(statusCode);
  const currentResponse = isRecord(responses[statusKey]) ? responses[statusKey] : {};
  const content = isRecord(currentResponse.content) ? currentResponse.content : {};
  const currentMediaValue = content[observed.contentType];
  const currentMedia = isRecord(currentMediaValue) ? currentMediaValue : {};
  const nextContent = {
    ...content,
    [observed.contentType]: { ...currentMedia, schema: mergedSchema(currentMedia.schema, observed.schema), example: observed.example },
  };
  return {
    ...root,
    responses: {
      ...responses,
      [statusKey]: { ...currentResponse, content: nextContent },
    },
  };
}

export function mergeResponseParameters(current: readonly ResponseParameterShape[], observed: ObservedResponseContract["responseParameters"]): ResponseParameterShape[] {
  if (!observed.length) return current.map(({ id, name, dataType, description }) => ({ id, name, dataType, description }));
  const observedByName = new Map(observed.map((item) => [item.name, item]));
  const merged = current.map(({ id, name, dataType, description }) => {
    const next = observedByName.get(name);
    return next ? { id, name, dataType: next.dataType, description: description || next.description } : { id, name, dataType, description };
  });
  const existingNames = new Set(current.map((item) => item.name));
  for (const item of observed) if (!existingNames.has(item.name)) merged.push({ id: undefined, ...item });
  return merged;
}

function responseMediaSchema(schema: unknown, statusCode: number, contentType: string) {
  if (!isRecord(schema) || !isRecord(schema.responses)) return undefined;
  const status = schema.responses[String(statusCode)];
  if (!isRecord(status) || !isRecord(status.content)) return undefined;
  const media = status.content[contentType];
  return isRecord(media) ? media.schema : undefined;
}

export function deriveResponseContractChanges(input: {
  endpointSchema: unknown;
  responseExample: unknown;
  responseFormats: readonly string[];
  responseParameters: readonly ResponseParameterShape[];
  observed: ObservedResponseContract;
  statusCode: number;
}) {
  const success = input.statusCode >= 200 && input.statusCode < 400;
  const mergedParameters = success && input.observed.format === "JSON" ? mergeResponseParameters(input.responseParameters, input.observed.responseParameters) : [...input.responseParameters];
  const parameterChanged = !responseValuesEqual(mergedParameters.map(({ name, dataType, description }) => ({ name, dataType, description })), input.responseParameters.map(({ name, dataType, description }) => ({ name, dataType, description })));
  const mergedSchema = mergeResponseSchema(input.endpointSchema, input.observed, input.statusCode);
  const schemaChanged = !responseValuesEqual(responseMediaSchema(input.endpointSchema, input.statusCode, input.observed.contentType) ?? null, responseMediaSchema(mergedSchema, input.statusCode, input.observed.contentType) ?? null);
  const formatsChanged = success && !input.responseFormats.includes(input.observed.format);
  const missingExample = success && (input.responseExample === null || input.responseExample === undefined);
  const exampleChanged = success && !responseValuesEqual(input.responseExample, input.observed.example);
  return {
    success,
    mergedParameters,
    schemaChanged,
    formatsChanged,
    parameterChanged,
    missingExample,
    exampleChanged,
    shouldWrite: schemaChanged || formatsChanged || parameterChanged || missingExample || exampleChanged,
    nextSchema: schemaChanged || formatsChanged || exampleChanged ? mergedSchema : input.endpointSchema,
    nextFormats: observedResponseFormats(input.responseFormats, input.observed.format),
  };
}

export function observedResponseFormats(current: readonly string[], observed: ApiResponseFormat) {
  return current.includes(observed) ? [...current] : [...current, observed];
}

export function formatResponseExample(value: unknown) {
  if (value === null || value === undefined) return "(无文本返回示例)";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
