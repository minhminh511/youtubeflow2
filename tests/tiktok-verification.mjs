import assert from "node:assert/strict";

const base = process.env.TEST_URL || "http://localhost:3000";

const session = await fetch(`${base}/api/workspace`);
const cookie = session.headers.get("set-cookie")?.split(";")[0];
const status = await (await fetch(`${base}/api/tiktok/status`, { headers: { cookie } })).json();
const d = status.diagnostics ?? {};
const configured = d.verificationConfigured === true;

// TikTok's URL-prefix method fetches /tiktok<SIGNATURE>.txt at the site root.
// That path only exists through a rewrite, so it is the crucial one to verify.
if (configured && d.verificationFileName) {
  const expectedLine = `tiktok-developers-site-verification=${d.verificationSignature}`;

  const signaturePath = await fetch(`${base}/${d.verificationFileName}`, { cache: "no-store" });
  assert.equal(signaturePath.status, 200, `/tiktok<SIG>.txt is served (${d.verificationFileName})`);
  assert.match(signaturePath.headers.get("content-type") || "", /text\/plain/);
  assert.equal((await signaturePath.text()), expectedLine, "serves the exact verification line, no BOM or newline");
  assert.equal(signaturePath.headers.get("x-content-type-options"), "nosniff");

  const head = await fetch(`${base}/${d.verificationFileName}`, { method: "HEAD" });
  assert.equal(head.status, 200, "HEAD is answered (TikTok may probe)");

  const backstop = await fetch(`${base}/tiktok-developers-site-verification.txt`, { cache: "no-store" });
  assert.equal(backstop.status, 200, "backstop path also works");
  assert.equal((await backstop.text()), expectedLine, "backstop returns the same line");

  // The rewrite must stay narrow: unrelated .txt files must not be served.
  const unrelated = await fetch(`${base}/not-a-tiktok-file.txt`, { cache: "no-store" });
  assert.equal(unrelated.status, 404, "rewrite only matches tiktok*.txt");

  console.log(`PASS: URL-prefix file served at /${d.verificationFileName} with the exact token; HEAD works; rewrite is narrow`);
} else {
  const res = await fetch(`${base}/tiktok-developers-site-verification.txt`, { cache: "no-store" });
  assert.equal(res.status, 404, "answers 404 (not a crash) when TIKTOK_SITE_VERIFICATION is unset");
  assert.equal(d.verificationFileName, null, "file name is null when unconfigured");
  console.log("PASS: verification routes return a clear 404 when TIKTOK_SITE_VERIFICATION is unset");
}

// Ownership diagnostics must never leak credentials.
assert.equal(typeof d.hostname, "string");
assert.equal(typeof d.quickTunnel, "boolean");
assert.equal(typeof d.redirectOverridden, "boolean");
assert.equal(typeof d.verificationConfigured, "boolean");
const serialized = JSON.stringify(status);
assert.ok(!/aw[A-Za-z0-9]{6,}/.test(serialized), "no client key value in the payload");
assert.ok(!serialized.includes("access_token"), "no access token in the payload");
for (const field of ["clientKey", "clientSecret"]) {
  assert.ok(!("value" in (d[field] ?? {})), `${field} must not expose its value`);
}
console.log(`PASS: ownership diagnostics exposed safely (hostname=${d.hostname || "—"}, tunnel=${d.quickTunnel})`);
