const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 24 * 7;

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  return `${issuedAt}.${await signature(issuedAt, secret)}`;
}

export async function validSessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [issuedAt, provided, extra] = token.split(".");
  if (extra || !issuedAt || !provided || !/^\d+$/.test(issuedAt) || !/^[0-9a-f]{64}$/.test(provided)) return false;
  const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
  if (age < 0 || age > SESSION_SECONDS) return false;
  const expected = await signature(issuedAt, secret);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  return difference === 0;
}
