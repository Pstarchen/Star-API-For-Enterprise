import assert from "node:assert/strict";
import { unzipSync, zipSync, strToU8 } from "fflate";

const { resolvePhpEntryFile } = await import("../src/lib/php-package.ts");

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
