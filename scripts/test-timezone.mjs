import assert from "node:assert/strict";

const { DEFAULT_USER_TIME_ZONE, formatUserDate, userTimeZone, validTimeZone } = await import("../src/lib/timezone.ts");

assert.equal(validTimeZone("Asia/Shanghai"), true);
assert.equal(validTimeZone("America/New_York"), true);
assert.equal(validTimeZone("Not/A_Time_Zone"), false);
assert.equal(userTimeZone("Europe/London"), "Europe/London");
assert.equal(userTimeZone(""), DEFAULT_USER_TIME_ZONE);
const instant = "2026-01-01T00:00:00.000Z";
assert.notEqual(formatUserDate(instant, "UTC"), formatUserDate(instant, "Asia/Shanghai"));
assert.equal(formatUserDate("invalid", "Asia/Shanghai"), null);

console.log("PASS user timezone validation");
