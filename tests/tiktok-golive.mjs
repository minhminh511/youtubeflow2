import assert from "node:assert/strict";

const base = process.env.TEST_URL || "http://localhost:3000";
const session = await fetch(`${base}/api/workspace`);
const cookie = session.headers.get("set-cookie")?.split(";")[0];
const status = await (await fetch(`${base}/api/tiktok/status`, { headers: { cookie } })).json();
const d = status.diagnostics ?? {};

// The checklist in the UI derives these two states from the server, so both must be trustworthy.
assert.equal(typeof d.configured, "boolean", "credential validity is reported");

// APP_URL vs the verified redirect URI: the checklist compares the origin of both.
const derivedOrigin = (d.redirectUriToRegister || "").replace(/\/api\/tiktok\/callback$/, "");
assert.equal(typeof derivedOrigin, "string");
if (d.configured) {
  assert.equal(d.appUrl, derivedOrigin, "APP_URL and the registered redirect URI share one origin");
  console.log(`PASS: credentials valid and origins aligned (${d.appUrl})`);
} else {
  assert.ok(d.problems.length > 0, "an invalid configuration always explains why");
  console.log("PASS: invalid credentials are reported with explicit reasons");
}

// A connected account must report publish capability honestly.
assert.equal(typeof status.connected, "boolean");
assert.equal(typeof status.canPublish, "boolean");
if (status.connected) {
  assert.ok(status.account?.openId || status.account?.displayName, "a connection always carries its account");
} else {
  assert.equal(status.canPublish, false, "cannot claim publish rights without a connection");
}
console.log(`PASS: connection state reported honestly (connected=${status.connected}, canPublish=${status.canPublish})`);

// Ownership state used by the checklist must never be guessed.
assert.equal(typeof d.verificationConfigured, "boolean");
assert.equal(typeof d.quickTunnel, "boolean");
console.log("PASS: ownership and tunnel state are explicit, not guessed");
