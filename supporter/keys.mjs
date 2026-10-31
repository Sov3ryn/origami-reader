import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";

export const KEY_ID = "supporter-2026-01";
export function issueKey(privatePem, id = randomUUID(), issuedAt = new Date().toISOString()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, kid: KEY_ID, product: "origami-reader", grant: "all-cosmetics", id, issuedAt }));
  const signature = sign(null, payload, createPrivateKey(privatePem));
  return `ORIGAMI1.${payload.toString("base64url")}.${signature.toString("base64url")}`;
}
export function publicKey(privatePem) {
  return createPublicKey(createPrivateKey(privatePem)).export({ format: "jwk" }).x;
}
export function verifyKey(key, publicKeys) {
  if (typeof key !== "string" || key.length > 4096) throw new Error("Invalid supporter key");
  const [prefix, encoded, signature, extra] = key.replace(/\s/g, "").split(".");
  if (prefix !== "ORIGAMI1" || !encoded || !signature || extra !== undefined) throw new Error("Invalid supporter key");
  const payload = Buffer.from(encoded, "base64url");
  const claims = JSON.parse(payload.toString("utf8"));
  if (claims.v !== 1 || claims.product !== "origami-reader" || claims.grant !== "all-cosmetics"
    || typeof claims.id !== "string" || !claims.id || Buffer.byteLength(claims.id) > 128
    || typeof claims.issuedAt !== "string" || !claims.issuedAt
    || !Object.hasOwn(publicKeys, claims.kid)) throw new Error("Invalid supporter key");
  const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKeys[claims.kid] }, format: "jwk" });
  if (!verify(null, payload, pub, Buffer.from(signature, "base64url"))) throw new Error("Invalid supporter key");
  return claims;
}
