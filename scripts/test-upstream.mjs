import assert from "node:assert/strict";

const { mergeUpstreamQuery, upstreamHealthTarget } = await import("../src/lib/upstream-url.ts");

assert.equal(
  upstreamHealthTarget("https://api1.starchen.top/java?address=play.nftown.fun", "/").toString(),
  "https://api1.starchen.top/java?address=play.nftown.fun",
);
assert.equal(
  upstreamHealthTarget("https://provider.example.com/api", "/").toString(),
  "https://provider.example.com/api",
);
assert.equal(
  upstreamHealthTarget("https://provider.example.com/api", "/health").toString(),
  "https://provider.example.com/api/health",
);
assert.equal(
  upstreamHealthTarget("https://provider.example.com/api?token=ignored", "/health").toString(),
  "https://provider.example.com/api/health",
);
assert.equal(
  mergeUpstreamQuery(new URL("https://provider.example.com/java?token=fixed&address=default"), "address=play.nftown.fun&type=json").toString(),
  "https://provider.example.com/java?token=fixed&address=play.nftown.fun&type=json",
);

console.log("Validated upstream health targets for fixed URLs and service prefixes.");
