import { createHmac } from "crypto";

export function getSecretHash(
  clientId: string,
  clientSecret: string,
  username: string
): string {
  const message = `${username}${clientId}`;
  return createHmac("SHA256", clientSecret).update(message).digest("base64");
}
