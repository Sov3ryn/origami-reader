import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { issueKey, verifyKey, publicKey, KEY_ID } from "./keys.mjs";

test("keys remain reusable without expiry, identity disclosure or device binding", () => {
  const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
  const keys = { [KEY_ID]: publicKey(pem) };
  const key = issueKey(pem, "reader-id", "2000-01-01T00:00:00Z");
  const first = verifyKey(key, keys);
  assert.deepEqual(verifyKey(key, keys), first);
  assert.deepEqual(Object.keys(first).sort(), ["v", "kid", "product", "grant", "id", "issuedAt"].sort());
  assert.throws(() => verifyKey(key, {}));
  const parts = key.split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...first, id: "forged" })).toString("base64url");
  assert.throws(() => verifyKey(parts.join("."), keys));
  assert.throws(() => verifyKey(key + ".extra", keys));
  assert.throws(() => verifyKey("x".repeat(5000), keys));
});
