import assert from "node:assert/strict";
import { deriveResponseContractChanges, formatResponseExample, inferResponseContract, mergeResponseParameters, mergeResponseSchema, observedResponseFormats, responseValuesEqual } from "../src/lib/response-contract.ts";

const json = inferResponseContract({
  body: JSON.stringify({ code: 200, message: "ok", data: { id: 7, enabled: true }, items: [1, 2] }),
  contentType: "application/json; charset=utf-8",
  statusCode: 200,
});
assert.equal(json.format, "JSON");
assert.equal(json.contentType, "application/json");
assert.deepEqual(json.responseParameters.map(({ name, dataType }) => ({ name, dataType })), [
  { name: "code", dataType: "integer" },
  { name: "message", dataType: "string" },
  { name: "data", dataType: "object" },
  { name: "items", dataType: "array" },
]);
assert.deepEqual(json.schema, {
  type: "object",
  properties: {
    code: { type: "integer" },
    message: { type: "string" },
    data: { type: "object", properties: { id: { type: "integer" }, enabled: { type: "boolean" } }, required: ["id", "enabled"] },
    items: { type: "array", items: { type: "integer" } },
  },
  required: ["code", "message", "data", "items"],
});

const text = inferResponseContract({ body: '{"looks":"json"}', contentType: "text/plain; charset=utf-8", statusCode: 200 });
assert.equal(text.format, "TXT");
assert.equal(text.example, '{"looks":"json"}');
assert.deepEqual(text.responseParameters, []);

const malformedJson = inferResponseContract({ body: "not-json", contentType: "application/json" });
assert.equal(malformedJson.format, "JSON");
assert.equal(malformedJson.example, "not-json");
assert.equal(malformedJson.schema.type, "string");
assert.equal(inferResponseContract({ body: '{"without":"header"}', contentType: "application/octet-stream" }).format, "JSON");

const withJson = mergeResponseSchema({ requestBody: { required: true } }, json, 200);
const withText = mergeResponseSchema(withJson, text, 200);
assert.deepEqual(withText.requestBody, { required: true });
assert.deepEqual(Object.keys(withText.responses["200"].content), ["application/json", "text/plain"]);
const jsonVariant = inferResponseContract({ body: JSON.stringify({ code: 200, detail: "variant" }), contentType: "application/json" });
const withVariant = mergeResponseSchema(withText, jsonVariant, 200);
assert.deepEqual(Object.keys(withVariant.responses["200"].content["application/json"].schema.properties), ["code", "message", "data", "items", "detail"]);
assert.deepEqual(withVariant.responses["200"].content["application/json"].schema.required, ["code"]);
const sameShapeDifferentExample = inferResponseContract({ body: JSON.stringify({ code: 201, message: "created", data: { id: 8, enabled: false }, items: [3] }), contentType: "application/json" });
const latest = deriveResponseContractChanges({ endpointSchema: withJson, responseExample: json.example, responseFormats: ["JSON"], responseParameters: json.responseParameters, observed: sameShapeDifferentExample, statusCode: 200 });
assert.equal(latest.schemaChanged, false);
assert.equal(latest.exampleChanged, true);
assert.equal(latest.shouldWrite, true);

const mergedParameters = mergeResponseParameters(
  [{ name: "code", dataType: "string", description: "业务状态码" }],
  json.responseParameters,
);
assert.deepEqual(mergedParameters.map(({ name, dataType, description }) => ({ name, dataType, description })), [
  { name: "code", dataType: "integer", description: "业务状态码" },
  { name: "message", dataType: "string", description: "" },
  { name: "data", dataType: "object", description: "" },
  { name: "items", dataType: "array", description: "" },
]);
assert.deepEqual(observedResponseFormats(["JSON"], "TXT"), ["JSON", "TXT"]);
assert.deepEqual(observedResponseFormats(["TXT", "JSON"], "JSON"), ["TXT", "JSON"]);
assert.equal(formatResponseExample(null), "(无文本返回示例)");
assert.equal(responseValuesEqual({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
assert.equal(responseValuesEqual({ value: "first" }, { value: "second" }), false);

console.log("Response contract tests passed.");
