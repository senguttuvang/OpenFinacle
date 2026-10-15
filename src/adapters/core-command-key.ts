// The pinned core stores idempotency keys in a VARCHAR(50) column.
export const coreCommandKey = async (key: string): Promise<string> => {
  if (key.length <= 50) return key;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 40);
};
