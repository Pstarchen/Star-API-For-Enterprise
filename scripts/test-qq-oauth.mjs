import assert from "node:assert/strict";
import { parseQqJson, parseQqTokenResponse, qqProviderAccountId } from "../src/lib/qq-oauth.ts";

assert.deepEqual(parseQqJson('{"client_id":"123","openid":"abc"}'), { client_id: "123", openid: "abc" });
assert.deepEqual(parseQqJson('callback( {"client_id":"123","openid":"abc","nickname":"A ) B"} );'), { client_id: "123", openid: "abc", nickname: "A ) B" });
assert.deepEqual(parseQqTokenResponse('{"access_token":"token","expires_in":5184000}'), { access_token: "token", expires_in: 5184000 });
assert.deepEqual(parseQqTokenResponse("access_token=token&expires_in=5184000&refresh_token=next"), { access_token: "token", expires_in: "5184000", refresh_token: "next" });
assert.equal(parseQqJson("not-json"), null);

const providerAccountId = qqProviderAccountId("123", "openid");
assert.equal(providerAccountId, "123:openid");

console.log("QQ OAuth tests passed.");
