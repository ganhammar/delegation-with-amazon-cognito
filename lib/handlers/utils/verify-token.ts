import { verify } from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import fetch from "node-fetch";

interface JWK {
  kty: "RSA";
  n: string;
  e: string;
  kid: string;
  alg?: string;
  use?: string;
}

interface JWKS {
  keys: JWK[];
}

export async function validateToken(
  token: string,
  userPoolId: string,
  region: string
) {
  try {
    const sections = token.split(".");
    const header = JSON.parse(
      Buffer.from(sections[0], "base64").toString("utf8")
    );
    const kid = header.kid;
  
    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const response = await fetch(jwksUrl);
    const data = (await response.json()) as JWKS;
  
    const jwk = data.keys.find((key) => key.kid === kid);
    if (!jwk) {
      throw new Error("Invalid token");
    }
  
    const pem = jwkToPem(jwk);
    verify(token, pem, { algorithms: ["RS256"] });

    return true;
  } catch (error) {
    return false;
  }
}