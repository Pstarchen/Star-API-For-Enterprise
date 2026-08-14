import assert from "node:assert/strict";
import { unzipSync, zipSync, strToU8 } from "fflate";

const { resolvePhpEntryFile } = await import("../src/lib/php-package.ts");
const { normalizePhpPackageMaxMb, phpPackageExpandedMaxBytes, phpPackageMaxBytes } = await import("../src/lib/platform.ts");

assert.equal(normalizePhpPackageMaxMb(undefined), 16);
assert.equal(normalizePhpPackageMaxMb(256), 256);
assert.equal(normalizePhpPackageMaxMb(0), 16);
assert.equal(normalizePhpPackageMaxMb(1025), 16);
assert.equal(phpPackageMaxBytes(1024), 1024 * 1024 * 1024);
assert.equal(phpPackageExpandedMaxBytes(16), 32 * 1024 * 1024);
assert.equal(phpPackageExpandedMaxBytes(256), 256 * 1024 * 1024);

assert.equal(resolvePhpEntryFile(["project/index.php", "project/data/a.json"], ""), "project/index.php");
assert.equal(resolvePhpEntryFile(["Project/Index.PHP", "Project/lib.php"], "index.php"), "Project/Index.PHP");
assert.equal(resolvePhpEntryFile(["service/custom.php"], ""), "service/custom.php");
assert.throws(() => resolvePhpEntryFile(["a/index.php", "b/index.php"], ""), /PHP_ENTRY_AMBIGUOUS/);
assert.throws(() => resolvePhpEntryFile(["a/index.php", "deeper/b/index.php"], ""), /PHP_ENTRY_AMBIGUOUS/);
assert.throws(() => resolvePhpEntryFile(["service/custom.php"], "missing.php"), /PHP_ENTRY_NOT_FOUND:missing\.php/);
assert.throws(() => resolvePhpEntryFile(["other/index.php"], "expected/index.php"), /PHP_ENTRY_NOT_FOUND:expected\/index\.php/);

const archive = zipSync({
  "hitokoto/index.php": strToU8("<?php echo 'ok';"),
  "hitokoto/data/a.json": strToU8('["hello"]'),
});
const unpacked = unzipSync(archive);
assert.equal(resolvePhpEntryFile(Object.keys(unpacked), ""), "hitokoto/index.php");
assert.deepEqual(Object.keys(unpacked).sort(), ["hitokoto/data/a.json", "hitokoto/index.php"]);

assert.equal(resolvePhpEntryFile(["index.php"], ""), "index.php");

console.log("PASS PHP package entry discovery");
