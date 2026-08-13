import assert from "node:assert/strict";

const { detectImageSignature, detectImageSignatureWithOffset } = await import("../src/lib/image-signature.ts");

assert.deepEqual(detectImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])), { mimeType: "image/jpeg", extension: ".jpg" });
assert.deepEqual(detectImageSignatureWithOffset(Uint8Array.from([0xef, 0xbb, 0xbf, 0x20, 0x00, 0xff, 0xd8, 0xff])), { mimeType: "image/jpeg", extension: ".jpg", offset: 5 });
assert.equal(detectImageSignature(Uint8Array.from([0x3c, 0x3f, 0x70, 0x68, 0x70])), null);

console.log("PASS image signature detection");
