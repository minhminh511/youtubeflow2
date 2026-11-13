import assert from "node:assert/strict";

const base = process.env.TEST_URL || "http://localhost:3000";

// The callback must classify failures correctly. "invalid_request / malformed" is a configuration
// problem, not a rejected authorisation code — mislabelling it sent the user down the wrong path.
const session = await fetch(`${base}/api/workspace`);
const cookie = session.headers.get("set-cookie")?.split(";")[0];

// No state cookie -> invalid_state, never a crash.
const noState = await fetch(`${base}/api/tiktok/callback?code=abc`, { redirect: "manual", headers: { cookie } });
assert.equal(noState.status, 307);
assert.match(noState.headers.get("location") || "", /tt=invalid_state/);

// TikTok-side error is forwarded with its own description.
const denied = await fetch(`${base}/api/tiktok/callback?error=user_cancelled_authorize&error_description=User+cancelled`, { redirect: "manual", headers: { cookie } });
assert.match(denied.headers.get("location") || "", /tt=access_denied/);

const source = await (await import("node:fs/promises")).readFile("src/app/api/tiktok/callback/route.ts", "utf8");

// A literal '+' decodes to a space; the code must be repaired before the exchange.
assert.match(source, /replace\(\/ \/g, "\+"\)/, "space-to-plus repair for the authorisation code");
assert.match(source, /hadSpace/, "the repair is reported in the trace");

// Classification must not treat "malformed" as a rejected code.
assert.match(source, /params_malformed/, "malformed has its own flag");
assert.match(source, /invalid_grant\|invalid_code\|authorization code/, "only genuine grant errors map to code_rejected");
const guard = /const codeRejected = [^;]+;/.exec(source)?.[0] ?? "";
assert.ok(!/malformed/.test(guard), "the malformed case is explicitly excluded from code_rejected");

// The trace must tell the user what was actually sent.
for (const part of ["code=", "redirect_uri=", "scope=", "key="]) {
  assert.ok(source.includes(part), `trace includes ${part}`);
}

console.log("PASS: callback classifies malformed vs rejected code, repairs '+' in codes, and reports a masked trace");
