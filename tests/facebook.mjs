import assert from "node:assert/strict";

const base = process.env.TEST_URL || "http://localhost:3000";
const session = await fetch(`${base}/api/workspace`);
assert.equal(session.status, 200);
const cookie = session.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "workspace cookie issued");
const headers = { cookie, "Content-Type": "application/json" };
const call = (path, options = {}) => fetch(`${base}${path}`, { redirect: "manual", ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? headers : { cookie }), ...(options.headers || {}) } });
const created = { posts: [], earnings: [], plans: [] };

try {
  // 1. Anonymous access is refused everywhere.
  assert.equal((await fetch(`${base}/api/facebook/posts`)).status, 401, "anonymous cannot read posts");
  assert.equal((await fetch(`${base}/api/facebook/earnings`)).status, 401, "anonymous cannot read earnings");

  // 2. Configuration is reported honestly; OAuth without app credentials redirects to a clear message.
  const status = await (await call("/api/facebook/status")).json();
  assert.equal(status.connected, false);
  assert.equal(typeof status.configured, "boolean");
  assert.ok(status.redirectUri.endsWith("/api/facebook/callback"), "redirect URI shown for Meta setup");
  if (!status.configured) {
    const connect = await call("/api/facebook/connect");
    assert.equal(connect.status, 307);
    assert.match(connect.headers.get("location") || "", /fb=missing_config/);
  }
  const forged = await call("/api/facebook/callback?code=abc&state=forged");
  assert.match(forged.headers.get("location") || "", /fb=invalid_state/, "callback rejects a state that was never issued");

  // 3. Actions that need a connected Page fail with actionable codes, not crashes.
  assert.equal((await call("/api/facebook/overview")).status, 409);
  assert.equal((await call("/api/facebook/earnings/sync", { method: "POST" })).status, 409);
  assert.equal((await call("/api/facebook/active", { method: "POST", body: JSON.stringify({ pageId: "12345678" }) })).status, 409);
  assert.equal((await call("/api/facebook/active", { method: "POST", body: JSON.stringify({ pageId: "bad" }) })).status, 400);

  // 4. Server-side policy gate: risky content is refused before any Meta call.
  const risky = new FormData();
  risky.set("mode", "publish");
  risky.set("kind", "text");
  risky.set("message", "Chắc chắn kiếm 5 triệu mỗi ngày, like và share để nhận quà nhé!");
  const blocked = await call("/api/facebook/posts", { method: "POST", body: risky });
  assert.equal(blocked.status, 422, "policy blockers stop publishing on the server");
  const blockedBody = await blocked.json();
  const areas = blockedBody.findings.map((item) => item.id);
  assert.ok(areas.includes("bait") && areas.includes("finance"), `expected bait and finance findings, got ${areas}`);

  const branded = new FormData();
  branded.set("mode", "publish");
  branded.set("kind", "text");
  branded.set("message", "Hợp tác cùng thương hiệu mới, cảm ơn nhà tài trợ đã đồng hành hôm nay.");
  const brandedBlocked = await call("/api/facebook/posts", { method: "POST", body: branded });
  assert.equal(brandedBlocked.status, 422, "sponsored content without disclosure is refused");

  // 5. Clean drafts are stored locally and can be edited and removed, with no Meta call.
  const draftForm = new FormData();
  draftForm.set("mode", "draft");
  draftForm.set("kind", "text");
  draftForm.set("message", `Bản nháp kiểm thử Facebook ${Date.now()}. Chia sẻ kinh nghiệm thật của mình.`);
  draftForm.set("notes", "Ghi chú nội bộ kiểm thử");
  const draftRes = await call("/api/facebook/posts", { method: "POST", body: draftForm });
  assert.equal(draftRes.status, 201);
  const draft = await draftRes.json();
  created.posts.push(draft.id);
  assert.equal(draft.status, "draft");
  assert.equal(draft.policyGrade, "A+");

  const patched = await call(`/api/facebook/posts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ message: "Bản nháp đã sửa, nội dung hợp lệ và trung tính." }) });
  assert.equal(patched.status, 200);
  assert.match((await patched.json()).message, /đã sửa/);
  const listed = await (await call("/api/facebook/posts")).json();
  assert.ok(listed.some((post) => post.id === draft.id), "draft appears in history");

  const mediaDraft = new FormData();
  mediaDraft.set("mode", "draft");
  mediaDraft.set("kind", "reel");
  mediaDraft.set("message", "x");
  assert.equal((await call("/api/facebook/posts", { method: "POST", body: mediaDraft })).status, 400, "media cannot be saved as a draft");

  const schedule = new FormData();
  schedule.set("mode", "schedule");
  schedule.set("kind", "text");
  schedule.set("message", "Nội dung hẹn giờ kiểm thử đủ điều kiện, không có lỗi chính sách.");
  schedule.set("scheduledAt", new Date(Date.now() + 2 * 60 * 1000).toISOString());
  const tooSoon = await call("/api/facebook/posts", { method: "POST", body: schedule });
  assert.equal(tooSoon.status, 422, "Facebook refuses scheduling inside 10 minutes");

  const removed = await call(`/api/facebook/posts/${draft.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  created.posts = created.posts.filter((id) => id !== draft.id);

  // 6. Monetization: manual entry, CSV import (idempotent) and validation.
  const manual = await call("/api/facebook/earnings", { method: "POST", body: JSON.stringify({ date: "2026-10-05", amount: "125.50", currency: "usd", source: "Reels", note: "Kiểm thử" }) });
  assert.equal(manual.status, 201);
  const manualRow = await manual.json();
  created.earnings.push(manualRow.id);
  assert.equal(manualRow.currency, "USD");
  assert.equal((await call("/api/facebook/earnings", { method: "POST", body: JSON.stringify({ date: "2026-13-40", amount: "1" }) })).status, 400, "impossible date rejected");
  assert.equal((await call("/api/facebook/earnings", { method: "POST", body: JSON.stringify({ date: "2026-10-05", amount: "1,250" }) })).status, 400, "thousands separator rejected");

  const csv = "date,amount,currency,source,note\n2026-10-06,80.00,USD,Meta,Kiểm thử CSV\n07/10/2026,12.5,USD,Reels,Dòng hai\nbad-date,10,USD,Meta,Lỗi";
  const imported = await call("/api/facebook/earnings/import", { method: "POST", body: JSON.stringify({ csv }) });
  assert.equal(imported.status, 201);
  const importBody = await imported.json();
  assert.equal(importBody.inserted, 2);
  assert.equal(importBody.errors.length, 1, "invalid rows are reported, not silently accepted");
  const again = await (await call("/api/facebook/earnings/import", { method: "POST", body: JSON.stringify({ csv }) })).json();
  assert.equal(again.inserted, 0, "re-importing the same file creates no duplicates");
  const earnings = await (await call("/api/facebook/earnings")).json();
  assert.ok(Number(earnings.summary.total) >= 218, "summary totals include imported and manual rows");
  for (const entry of earnings.entries.filter((item) => item.source === "csv_import")) created.earnings.push(entry.id);

  // 7. Cross-platform: a Facebook draft becomes a YouTube-ready plan the Studio can open.
  const adapt = await call("/api/facebook/adapt", { method: "POST", body: JSON.stringify({ message: "Mẹo quay phim bằng điện thoại cho người mới bắt đầu. Ba bước đơn giản.", kind: "reel", pageName: "Trang thử" }) });
  assert.equal(adapt.status, 201);
  const adapted = await adapt.json();
  created.plans.push(adapted.planId);
  assert.ok(adapted.title.length <= 100, "YouTube title respects the 100-character limit");
  const plans = await (await call("/api/workspace")).json();
  const planRow = plans.plans.find((plan) => plan.id === adapted.planId);
  assert.equal(planRow.format, "short", "Reels become Shorts on the YouTube side");

  // 8. Deleting another workspace's records is impossible (the session has no access to them).
  const other = await fetch(`${base}/api/workspace`);
  const otherCookie = other.headers.get("set-cookie")?.split(";")[0];
  const foreign = await fetch(`${base}/api/facebook/earnings/${manualRow.id}`, { method: "DELETE", headers: { cookie: otherCookie } });
  assert.equal(foreign.status, 404, "another workspace cannot delete this earnings row");

  console.log("PASS: Facebook auth gating, OAuth state, server-side policy gate, drafts, earnings import/manual, idempotent CSV, cross-platform plan, workspace isolation");
} finally {
  for (const id of created.posts) await call(`/api/facebook/posts/${id}`, { method: "DELETE" }).catch(() => undefined);
  for (const id of created.earnings) await call(`/api/facebook/earnings/${id}`, { method: "DELETE" }).catch(() => undefined);
  for (const id of created.plans) await call(`/api/plans/${id}`, { method: "DELETE" }).catch(() => undefined);
}
