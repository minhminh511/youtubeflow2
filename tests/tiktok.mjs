import assert from "node:assert/strict";

const base = process.env.TEST_URL || "http://localhost:3000";
const session = await fetch(`${base}/api/workspace`);
assert.equal(session.status, 200);
const cookie = session.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "workspace cookie issued");
const headers = { cookie, "Content-Type": "application/json" };
const call = (path, options = {}) =>
  fetch(`${base}${path}`, {
    redirect: "manual",
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? headers : { cookie }), ...(options.headers || {}) },
  });
const created = { posts: [], plans: [] };

try {
  // 1. Anonymous access is refused.
  assert.equal((await fetch(`${base}/api/tiktok/posts`)).status, 401, "anonymous cannot read posts");
  assert.equal((await fetch(`${base}/api/tiktok/status`)).status, 401, "anonymous cannot read status");

  // 2. Configuration and OAuth entry points are reported honestly.
  const status = await (await call("/api/tiktok/status")).json();
  assert.equal(status.connected, false);
  assert.equal(typeof status.configured, "boolean");
  assert.ok(status.redirectUri.endsWith("/api/tiktok/callback"), "redirect URI shown for TikTok setup");
  assert.ok(status.request, "login request preview is exposed for comparison");
  assert.equal(status.request.endpoint, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(status.request.responseType, "code");
  assert.ok(Array.isArray(status.request.scopes) && status.request.scopes.length >= 1, "at least one scope requested");
  assert.ok(status.request.scopes.includes("user.info.basic"), "minimum Login Kit scope is always requested");
  assert.ok(/…|\(chưa có\)/.test(status.request.clientKeyMasked), "client_key is masked, never returned in full");
  assert.ok(Array.isArray(status.extraScopes), "extra scopes reported");
  assert.equal(typeof status.configured, "boolean");
  if (!status.configured) {
    const connect = await call("/api/tiktok/connect");
    assert.equal(connect.status, 307);
    assert.match(connect.headers.get("location") || "", /tt=missing_config/, "connect explains missing credentials");
  }
  const forged = await call("/api/tiktok/callback?code=abc&state=forged");
  assert.match(forged.headers.get("location") || "", /tt=invalid_state/, "callback rejects an unknown state");

  // 3. Actions that need a connected account fail with clear codes.
  assert.equal((await call("/api/tiktok/overview")).status, 409);
  assert.equal((await call("/api/tiktok/posts").then((response) => response.status)), 200, "history is readable without a connection");

  // 4. Server-side community-guideline gate stops risky captions before any API call.
  const risky = new FormData();
  risky.set("mode", "direct");
  risky.set("title", "Hack like tăng follower nhanh, nội dung 18+ lấp ló");
  const blocked = await call("/api/tiktok/posts", { method: "POST", body: risky });
  assert.equal(blocked.status, 422, "community-guideline blockers stop submission on the server");
  const blockedBody = await blocked.json();
  const ids = blockedBody.findings.map((item) => item.id);
  assert.ok(ids.includes("sexual") || ids.includes("spam"), `expected guideline findings, got ${ids}`);

  const tooLong = new FormData();
  tooLong.set("mode", "direct");
  tooLong.set("title", "x".repeat(2300));
  assert.equal((await call("/api/tiktok/posts", { method: "POST", body: tooLong })).status, 400, "caption length is enforced");

  // 5. Drafts are stored locally, editable and removable.
  const draft = new FormData();
  draft.set("mode", "draft");
  draft.set("title", `Video thử nghiệm TikTok ${Date.now()} #hoidapnhanh`);
  draft.set("notes", "Ghi chú nội bộ kiểm thử");
  const draftRes = await call("/api/tiktok/posts", { method: "POST", body: draft });
  assert.equal(draftRes.status, 201);
  const row = await draftRes.json();
  created.posts.push(row.id);
  assert.equal(row.status, "draft");
  // A caption draft has no video yet, so "missing media" may appear; community-guideline
  // blockers must not.
  const guidelineAreas = ["Nội dung người lớn", "Bạo lực & gây sốc", "Thù ghét", "Quấy rối", "Hành vi nguy hiểm", "Thông tin sai lệch", "Spam & gian lận", "An toàn trẻ em", "Hoạt động bất hợp pháp"];
  const badFindings = (row.policyFindings || []).filter((item) => item.level === "blocker" && guidelineAreas.includes(item.area));
  assert.deepEqual(badFindings, [], `clean caption must have no community-guideline blockers: ${JSON.stringify(badFindings)}`);
  assert.ok(row.policyScore >= 70, `clean caption should score well, got ${row.policyScore}`);

  const patched = await call(`/api/tiktok/posts/${row.id}`, { method: "PATCH", body: JSON.stringify({ title: "Bản nháp TikTok đã sửa #hoidapnhanh" }) });
  assert.equal(patched.status, 200);
  assert.match((await patched.json()).title, /đã sửa/);

  const listed = await (await call("/api/tiktok/posts")).json();
  assert.ok(listed.some((post) => post.id === row.id), "draft appears in history");

  // 6. Non-draft submissions require a real video file.
  const noMedia = new FormData();
  noMedia.set("mode", "direct");
  noMedia.set("title", "Nội dung hợp lệ không có video");
  const noMediaRes = await call("/api/tiktok/posts", { method: "POST", body: noMedia });
  assert.equal(noMediaRes.status, 422, "policy passes but submission is refused without media before any API call");

  // 7. Cross-platform: TikTok caption becomes a YouTube-ready plan.
  const adapt = await call("/api/facebook/adapt", {
    method: "POST",
    body: JSON.stringify({ message: "Cách quay video dọc 9:16 đẹp bằng điện thoại cho người mới.", kind: "reel", pageName: "TikTok thử nghiệm" }),
  });
  assert.equal(adapt.status, 201);
  const adapted = await adapt.json();
  created.plans.push(adapted.planId);
  assert.ok(adapted.title.length <= 100, "YouTube title respects the 100-character limit");

  // 8. Workspace isolation.
  const other = await fetch(`${base}/api/workspace`);
  const otherCookie = other.headers.get("set-cookie")?.split(";")[0];
  const foreign = await fetch(`${base}/api/tiktok/posts/${row.id}`, { method: "DELETE", headers: { cookie: otherCookie } });
  assert.equal(foreign.status, 404, "another workspace cannot delete this TikTok post");

  const removed = await call(`/api/tiktok/posts/${row.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  created.posts = created.posts.filter((id) => id !== row.id);

  console.log("PASS: TikTok auth gating, OAuth state, community-guideline gate, drafts, media requirement, cross-platform plan, workspace isolation");
} finally {
  for (const id of created.posts) await call(`/api/tiktok/posts/${id}`, { method: "DELETE" }).catch(() => undefined);
  for (const id of created.plans) await call(`/api/plans/${id}`, { method: "DELETE" }).catch(() => undefined);
}
