import assert from "node:assert/strict";
import { buildDocsCurlCommands } from "../src/lib/docs-curl.ts";

const getCommand = buildDocsCurlCommands({
  url: "https://api.example.test/api/lookup/{region}",
  methods: ["GET"],
  parameters: [
    { location: "PATH", name: "region", required: true, defaultValue: "cn north", sensitive: false },
    { location: "QUERY", name: "query", required: true, defaultValue: null, sensitive: false },
    { location: "QUERY", name: "size", required: false, defaultValue: "100", sensitive: false },
    { location: "QUERY", name: "unused", required: false, defaultValue: null, sensitive: false },
  ],
})[0];
assert.equal(getCommand.method, "GET");
assert.match(getCommand.command, /lookup\/cn%20north\?query=\{query\}&size=100/);
assert.doesNotMatch(getCommand.command, /unused/);

const postCommand = buildDocsCurlCommands({
  url: "https://api.example.test/api/create",
  methods: ["POST"],
  parameters: [
    { location: "BODY", name: "title", required: true, defaultValue: "Editor's choice", sensitive: false },
    { location: "BODY", name: "token", required: true, defaultValue: "must-not-leak", sensitive: true },
  ],
})[0];
assert.match(postCommand.command, /Content-Type: application\/json/);
assert.match(postCommand.command, /"title":"Editor'\\''s choice"/);
assert.match(postCommand.command, /"token":"\{token\}"/);
assert.doesNotMatch(postCommand.command, /must-not-leak/);

assert.deepEqual(buildDocsCurlCommands({ url: "https://api.example.test/api/php", methods: ["ALL"], parameters: [] }).map((item) => item.method), ["GET"]);
assert.deepEqual(buildDocsCurlCommands({ url: "https://api.example.test/api/default", methods: [], parameters: [] }).map((item) => item.method), ["GET"]);

console.log("Docs curl tests passed.");
