import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const nativeRequire = createRequire(resolve("package.json"));
const cache = new Map();
function loadTs(file) {
  const abs = resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const compiled = ts.transpileModule(readFileSync(abs, "utf8"), {
    fileName: abs,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (spec) => {
    if (spec === "server-only") return {};
    if (spec.startsWith("@/") || spec.startsWith(".")) {
      const base = spec.startsWith("@/") ? resolve("src", spec.slice(2)) : resolve(dirname(abs), spec);
      const target = [base + ".ts", resolve(base, "index.ts")].find(existsSync);
      if (target) return loadTs(target);
    }
    return nativeRequire(spec);
  };
  new Function("require", "module", "exports", compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}

const { sanitizeSecret, classifyClientKey, classifySecret, diagnoseTikTok, fingerprintSecret, sha256Hex, classifyCredentialProbe, environmentGuidance } = loadTs("src/lib/tiktok-config.ts");

// 1. Windows copy-paste problems are sanitised before ever reaching TikTok.
assert.equal(sanitizeSecret('  "awabc123def456"  '), "awabc123def456", "quotes and spaces stripped");
assert.equal(sanitizeSecret("'awabc123'"), "awabc123", "single quotes stripped");
assert.equal(sanitizeSecret("\uFEFFawabc123\r\n"), "awabc123", "BOM and CRLF stripped");
assert.equal(sanitizeSecret("TIKTOK_CLIENT_KEY=awabc123"), "TIKTOK_CLIENT_KEY=awabc123", "value is not silently rewritten beyond whitespace/quotes");
assert.equal(sanitizeSecret(undefined), "");
assert.equal(sanitizeSecret(null), "");

// 2. The exact case reported: a plausible-looking but invalid client_key must be blocked,
//    not forwarded to TikTok where it turns into an opaque error page.
const placeholder = classifyClientKey("your_client_key_here");
assert.equal(placeholder.blocking, true);
assert.equal(placeholder.kind, "placeholder");

assert.equal(classifyClientKey("").kind, "missing");
assert.equal(classifyClientKey("").blocking, true);
assert.equal(classifyClientKey("1234567890123456").kind, "app-id-likely", "an App ID is not a Client Key");
assert.equal(classifyClientKey("1234567890123456").blocking, true);
assert.equal(classifyClientKey("awabc 123").kind, "malformed", "embedded whitespace is rejected");
assert.equal(classifyClientKey("awabc-123_def").blocking, false, "valid characters accepted");
assert.equal(classifyClientKey("sbawabc123def").kind, "sandbox");
assert.equal(classifyClientKey("sbawabc123def").blocking, false, "sandbox keys stay usable but are flagged");
assert.equal(classifyClientKey("awabc123def").kind, "production");
assert.equal(classifyClientKey("zzabc123def").kind, "unverified");

assert.equal(classifySecret("").blocking, true);
assert.equal(classifySecret("short").blocking, true, "truncated secret rejected");
assert.equal(classifySecret("changeme-please-now").blocking, true, "placeholder secret rejected");
assert.equal(classifySecret("a".repeat(32)).blocking, false);

// 3. Diagnosis aggregates problems and warnings without exposing values.
const broken = diagnoseTikTok("https://creator.example.com", "your_client_key_here", "short");
assert.equal(broken.configured, false);
assert.ok(broken.problems.length >= 2, "both credentials reported");
assert.ok(broken.problems.every((problem) => !problem.includes("your_client_key_here")), "secret never echoed");

const sandbox = diagnoseTikTok("https://creator.example.com", "sbawabc123def", "a".repeat(32));
assert.equal(sandbox.configured, true, "sandbox keys are allowed so testers can still log in");
assert.equal(sandbox.likelySandboxMismatch, true);
assert.ok(sandbox.warnings.some((warning) => /sandbox/i.test(warning)), "sandbox mismatch explained");

const good = diagnoseTikTok("https://creator.example.com", "awabc123def456", "b".repeat(32));
assert.equal(good.configured, true);
assert.equal(good.problems.length, 0);
assert.equal(good.redirectUri, "https://creator.example.com/api/tiktok/callback");

// Redirect URI must be the full callback URL, not the bare origin.
const tunnel = diagnoseTikTok("https://vi-du-random-words.trycloudflare.com", "awabc123def456", "b".repeat(32));
assert.equal(tunnel.redirectUriToRegister, "https://vi-du-random-words.trycloudflare.com/api/tiktok/callback");
assert.notEqual(tunnel.redirectUriToRegister, "https://vi-du-random-words.trycloudflare.com/", "bare origin must never be suggested");
assert.equal(tunnel.quickTunnel, true, "quick tunnels are detected");
assert.ok(tunnel.warnings.some((warning) => /Quick Tunnel|trycloudflare/i.test(warning)), "unstable tunnel hostname is explained");
assert.equal(tunnel.appUrl, "https://vi-du-random-words.trycloudflare.com");
const stable = diagnoseTikTok("https://creator.example.com", "awabc123def456", "b".repeat(32));
assert.equal(stable.quickTunnel, false, "named domains are not flagged");
assert.equal(stable.redirectUriToRegister, "https://creator.example.com/api/tiktok/callback");

const local = diagnoseTikTok("http://localhost:3000/", "awabc123def456", "b".repeat(32));
assert.equal(local.appUrl, "http://localhost:3000", "trailing slash removed");
assert.ok(local.warnings.some((warning) => /localhost/i.test(warning)));

const insecure = diagnoseTikTok("http://creator.example.com", "awabc123def456", "b".repeat(32));
assert.ok(insecure.warnings.some((warning) => /HTTPS/i.test(warning)), "non-HTTPS deployment warned");

// 4. Masked fingerprint: comparable by a human, never reversible.
const print = fingerprintSecret("awTESTKEY0123456789abcde");
assert.equal(print.length, 24);
assert.ok(print.masked.startsWith("awTE") && print.masked.endsWith("bcde"), `masked form keeps head and tail: ${print.masked}`);
assert.ok(!print.masked.includes("KEY0123456789a"), "middle of the key is hidden");
assert.equal(print.sha256Prefix.length, 12);
assert.equal(fingerprintSecret("").masked, "(chưa có)");
assert.equal(fingerprintSecret("short").masked, "shor*");
// Fingerprint must be stable and match a known SHA-256 vector.
assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 known answer");
assert.equal(fingerprintSecret("awTESTKEY0123456789abcde").sha256Prefix, sha256Hex("awTESTKEY0123456789abcde").slice(0, 12));

// 5. Interpreting TikTok's answer to the client_credentials probe.
const okProbe = classifyCredentialProbe(200, { access_token: "clt.example", expires_in: 7200 });
assert.equal(okProbe.verdict, "recognized");
const badKey = classifyCredentialProbe(401, { error: "invalid_client", error_description: "Invalid client_key provided" });
assert.equal(badKey.verdict, "not_recognized", "explicit client_key rejection");
const badKey2 = classifyCredentialProbe(400, { data: {}, error: { code: "invalid_request", message: "client_key is invalid" } });
assert.equal(badKey2.verdict, "not_recognized", "nested error object form");
const badSecret = classifyCredentialProbe(401, { error: "invalid_client", error_description: "client_secret does not match" });
assert.equal(badSecret.verdict, "secret_mismatch");
const ambiguous = classifyCredentialProbe(400, { error: "invalid_request", error_description: "The request parameters are malformed." });
assert.equal(ambiguous.verdict, "inconclusive", "malformed response must not be reported as a wrong key");
const grant = classifyCredentialProbe(400, { error: "unsupported_grant_type" });
assert.equal(grant.verdict, "unsupported_grant");
assert.equal(classifyCredentialProbe(503, {}).verdict, "network");
assert.equal(classifyCredentialProbe(0, {}).verdict, "network");
assert.ok(okProbe.checkedAt.length > 10, "verdict carries a timestamp so repeated checks are distinguishable");

// 6. Environment detection drives the Sandbox/Production guidance.
const prod = diagnoseTikTok("https://creator.example.com", "awTESTSANDBOXFIXTURE", "b".repeat(32));
assert.equal(prod.environment, "production", "aw… is a Production key");
assert.equal(prod.keyPrefix, "aw", "only the prefix is exposed");
const sandboxEnv = diagnoseTikTok("https://creator.example.com", "sbawTESTFIXTURE99", "b".repeat(32));
assert.equal(sandboxEnv.environment, "sandbox", "sb… is a Sandbox key");
const unknown = diagnoseTikTok("https://creator.example.com", "zzwhatever123456", "b".repeat(32));
assert.equal(unknown.environment, "unclear");
assert.equal(classifyClientKey("sbawTESTFIXTURE99").blocking, false, "sandbox keys are accepted, not blocked");

const gSandbox = environmentGuidance("sandbox");
assert.equal(gSandbox.label, "Sandbox");
assert.ok(gSandbox.steps.some((step) => /Target users/i.test(step)), "sandbox steps mention Target users");
assert.ok(gSandbox.steps.some((step) => /\/api\/tiktok\/callback/.test(step)), "sandbox steps include the callback path");
assert.ok(gSandbox.caveats.some((note) => /Chỉ mình tôi|SELF_ONLY/i.test(note)), "unaudited private-only limit is stated");

const gProduction = environmentGuidance("production");
assert.equal(gProduction.label, "Production");
assert.ok(gProduction.steps.some((step) => /Sandbox/.test(step)), "production guidance explains how to switch to Sandbox");
assert.ok(gProduction.steps.some((step) => /Target users/i.test(step)), "switching requires re-adding target users");
assert.ok(gProduction.caveats.some((note) => /hai cặp khác nhau|trộn/i.test(note)), "mixing keys across tabs is warned about");

const gUnclear = environmentGuidance("unclear");
assert.ok(gUnclear.steps.length >= 2, "unclear environment still gives next steps");

// 7. TikTok answers "malformed" for a pair it does not know, so a structurally valid pair must
//    be reported as pair_not_recognized rather than a vague "inconclusive".
const amb = classifyCredentialProbe(400, { error: "invalid_request", error_description: "The request parameters are malformed." });
assert.equal(amb.verdict, "inconclusive", "raw classifier stays neutral");
const wellFormedKey = classifyClientKey(fingerprintSecret("sbawFAKEPAIRTEST01").masked.includes("x") ? "sbawFAKEPAIRTEST01" : "sbawFAKEPAIRTEST01");
assert.equal(wellFormedKey.blocking, false, "fixture key is structurally valid");
assert.equal(classifySecret("fakesecretvalue0123456789abcdef").blocking, false, "fixture secret is structurally valid");

console.log("PASS: TikTok credential sanitising, client_key classification (placeholder/App ID/malformed), sandbox and HTTPS warnings, no secret echoed");
