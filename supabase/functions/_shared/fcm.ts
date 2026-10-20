// FCM HTTP v1 for send-dish-alerts: an OAuth access token minted from the service account (RS256 JWT, WebCrypto, no dependency)
// and one topic send. Neither the key nor the token is ever logged; failures report a status code only.
export interface ServiceAccount { client_email: string; private_key: string }
export interface TopicMessage { topic: string; title: string; body: string; tag: string }

const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function mintAccessToken(saJson: string, fetchImpl: typeof fetch = fetch, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const sa = JSON.parse(saJson) as ServiceAccount;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600,
  }));
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!res.ok) throw new Error(`FCM token mint failed: ${res.status}`);
  return (await res.json()).access_token as string;
}

export function buildMessage(m: TopicMessage) {
  return {
    topic: m.topic,
    notification: { title: m.title, body: m.body },
    android: { priority: "HIGH", notification: { channel_id: "favorite_alerts", tag: m.tag } },
    apns: { headers: { "apns-collapse-id": m.tag, "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
    data: { route: "/halls" },
  };
}

/** True when FCM accepted it. Any other answer (429, 5xx, a thrown fetch) is false: the caller releases its claim for the next run. */
export async function sendToTopic(projectId: string, token: string, m: TopicMessage, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: buildMessage(m) }),
    });
    if (!res.ok) console.error(`FCM send failed for ${m.topic}: ${res.status}`);
    return res.ok;
  } catch {
    console.error(`FCM send threw for ${m.topic}`);
    return false;
  }
}
