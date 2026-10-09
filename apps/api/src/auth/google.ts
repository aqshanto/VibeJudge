// "Continue with Google" — OAuth 2.0 authorization code flow।
// id_token সরাসরি Google-এর token endpoint থেকে (TLS + client secret দিয়ে) আসে,
// তাই আলাদা signature যাচাই লাগে না; তবু aud/iss/exp চেক করা হয়।

import { randomBytes } from "node:crypto";
import { env } from "../env.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const OAUTH_STATE_COOKIE = "vj_oauth_state";

const redirectUri = () => `${env.publicWebUrl}/api/auth/google/callback`;

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
}

export async function exchangeCode(code: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: HTTP ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google did not return an id_token");

  const payload = JSON.parse(Buffer.from(id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (payload.aud !== env.googleClientId) throw new Error("id_token audience mismatch");
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new Error("id_token issuer mismatch");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("id_token expired");
  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name };
}
