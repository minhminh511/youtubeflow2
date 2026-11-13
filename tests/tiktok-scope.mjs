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

// The root cause of the Sandbox failure: /user/info/ rejects fields that need a scope the token
// does not carry. With only user.info.basic, requesting username/follower_count made TikTok error.
const source = readFileSync("src/lib/tiktok.ts", "utf8");

const basicOnly = /fields: "open_id,union_id,avatar_url,display_name,username/.test(source);
assert.equal(basicOnly, false, "must not request profile/stat fields with only user.info.basic");

assert.match(source, /user\.info\.basic/, "basic field group exists");
assert.match(source, /user\.info\.profile/, "profile fields are gated by their scope");
assert.match(source, /user\.info\.stats/, "stats fields are gated by their scope");
assert.match(source, /const granted = tokens\.scope\.split/, "granted scopes are read from the token response");
assert.match(source, /catch \{ \/\* optional fields only \*\/ \}/, "optional groups never fail the connection");

// The callback must forward the provider's message instead of a generic flag.
const callback = readFileSync("src/app/api/tiktok/callback/route.ts", "utf8");
assert.match(callback, /tt_detail/, "callback passes the real reason back to the UI");
assert.match(callback, /code_rejected/, "an expired/reused code gets its own actionable flag");

// The UI must keep the failure visible and explain it.
const ui = readFileSync("src/components/tiktok-connection.tsx", "utf8");
assert.match(ui, /lastFailure/, "UI stores the failure");
assert.match(ui, /Lần kết nối gần nhất thất bại/, "UI renders a persistent failure panel");
assert.match(ui, /mã chỉ dùng một lần/i, "UI explains single-use authorisation codes");

// A structurally valid pair answered with "malformed" must be named as an unrecognised pair.
const lib = readFileSync("src/lib/tiktok.ts", "utf8");
assert.match(lib, /pair_not_recognized/, "library exposes the pair verdict");
assert.match(lib, /pairLooksWellFormed/, "verdict is upgraded only when both values look valid");
assert.match(lib, /log_id/, "TikTok log id is surfaced for support");
const cfg = readFileSync("src/lib/tiktok-config.ts", "utf8");
assert.match(cfg, /pair_not_recognized/, "verdict type includes the pair case");
const pairUi = readFileSync("src/components/tiktok-connection.tsx", "utf8");
assert.match(pairUi, /tạo lại Client Secret/, "UI names the most common cause: regenerated secret");
assert.match(pairUi, /cùng một tab/, "UI tells the user to copy both values from one tab");

console.log("PASS: user/info fields are scope-gated, optional groups never break the connection, callback forwards the real error, UI keeps it visible");
