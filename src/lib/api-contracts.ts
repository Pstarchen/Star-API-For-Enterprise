export const apiHttpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"] as const;
export type ApiHttpMethod = (typeof apiHttpMethods)[number];

export const apiParameterLocations = ["PATH", "QUERY", "BODY"] as const;
export type ApiParameterLocation = (typeof apiParameterLocations)[number];

export const apiDataTypes = ["string", "integer", "number", "boolean", "array", "object"] as const;
export type ApiDataType = (typeof apiDataTypes)[number];

export const apiResponseFormats = ["TXT", "JSON", "BINARY"] as const;
export type ApiResponseFormat = (typeof apiResponseFormats)[number];

export type ApiRequestParameter = {
  id?: string;
  location: ApiParameterLocation;
  name: string;
  upstreamName: string;
  required: boolean;
  dataType: ApiDataType;
  defaultValue: string;
  description: string;
  pattern: string;
  sensitive: boolean;
};

export type ApiResponseParameter = {
  id?: string;
  name: string;
  dataType: ApiDataType;
  description: string;
};

export function normalizeMethods(methods: readonly ApiHttpMethod[]) {
  if (methods.includes("ALL")) return ["ALL"] as ApiHttpMethod[];
  return apiHttpMethods.filter((method): method is Exclude<ApiHttpMethod, "ALL"> => method !== "ALL" && methods.includes(method));
}

export function methodsOverlap(left: readonly string[], right: readonly string[]) {
  return left.includes("ALL") || right.includes("ALL") || left.some((method) => right.includes(method));
}

function exampleValue(type: string): unknown {
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "array") return [];
  if (type === "object") return {};
  return "string";
}

export function generateResponseExample(fields: readonly { name: string; dataType: string; description: string }[], formats: readonly string[], sample?: unknown) {
  if (sample !== undefined && sample !== null) return sample;
  if (formats[0] === "TXT" && !formats.includes("JSON")) return fields[0]?.description || "示例文本";
  return Object.fromEntries(fields.map((field) => [field.name, exampleValue(field.dataType)]));
}

export function formatApiMethods(methods: readonly string[]) {
  return methods.join(" / ");
}
