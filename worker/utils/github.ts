// src/utils/githubAppToken.ts
//
// Workers Runtime utility to mint a GitHub App installation access token.
// Uses WebCrypto + fetch; no Node dependencies.
//
// Secrets expected in env:
// - GITHUB_APP_ID
// - GITHUB_APP_PRIVATE_KEY_PEM   (PKCS#8: -----BEGIN PRIVATE KEY-----)
// - (optional) GITHUB_INSTALLATION_ID
//
// Usage:
//   import { mintGitHubInstallationToken } from "./utils/githubAppToken";
//   const { token } = await mintGitHubInstallationToken();
//   // pass token into sandbox env as GITHUB_TOKEN

import { env } from "cloudflare:workers";

export type GitHubInstallationTokenResult = {
  token: string;
  expiresAt: string; // ISO timestamp from GitHub
};

export type MintGitHubInstallationTokenOptions = {
  installationId?: string;
  appId?: string;
  privateKeyPemPkcs8?: string;
  // If you want to request reduced permissions, you can add support here later.
};

function pemPkcs8ToDer(pem: string): ArrayBuffer {
  const trimmed = pem.trim();
  if (!trimmed.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY_PEM must be PKCS#8 (-----BEGIN PRIVATE KEY-----). " +
        "If you have 'BEGIN RSA PRIVATE KEY', convert with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pk8.pem",
    );
  }

  const b64 = trimmed
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwtRS256(
  appId: string,
  privateKeyPemPkcs8: string,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // clock-skew tolerance
    exp: now + 10 * 60, // GitHub requires exp <= 10 minutes
    iss: appId,
  };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemPkcs8ToDer(privateKeyPemPkcs8),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    enc.encode(signingInput),
  );

  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

async function createInstallationAccessToken(
  jwt: string,
  installationId: string,
): Promise<GitHubInstallationTokenResult> {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "cf-workers-github-app-token",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    // Don’t log JWTs/tokens; error body is usually safe enough for debugging.
    throw new Error(`GitHub access_token mint failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { token: string; expires_at: string };
  return { token: json.token, expiresAt: json.expires_at };
}

/**
 * Mint a short-lived GitHub App installation token for `git clone`/`git push`.
 * Reads from Workers `env` by default but can be overridden via options for testing.
 */
export async function mintGitHubInstallationToken(
  options: MintGitHubInstallationTokenOptions = {},
): Promise<GitHubInstallationTokenResult> {
  const appId = options.appId ?? env.GITHUB_APP_ID;

  const privateKeyPemPkcs8 =
    options.privateKeyPemPkcs8 ?? env.GITHUB_APP_PRIVATE_KEY_PEM;

  const installationId = options.installationId ?? env.GITHUB_INSTALLATION_ID;

  if (!appId) throw new Error("Missing GITHUB_APP_ID (secret/binding).");
  if (!privateKeyPemPkcs8)
    throw new Error("Missing GITHUB_APP_PRIVATE_KEY_PEM (secret/binding).");
  if (!installationId)
    throw new Error(
      "Missing installationId (pass options.installationId or set GITHUB_INSTALLATION_ID).",
    );

  const jwt = await signJwtRS256(String(appId), String(privateKeyPemPkcs8));
  return await createInstallationAccessToken(jwt, String(installationId));
}
