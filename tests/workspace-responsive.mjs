import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const base = process.env.TEST_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const browserErrors = [];
const created = [];
const reports = [];
await mkdir("artifacts", { recursive: true });

async function noOverflow(page, label) {
  const measure = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(measure.scroll <= measure.width + 1, `${label}: horizontal overflow (${measure.scroll}/${measure.width})`);
}
async function accessibility(page, label) {
  // Opacity during an opening animation is not the settled reading contrast.
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter((animation) =>
      animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().iterations),
    );
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const violations = result.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => ({ target: node.target, reason: node.failureSummary })) }));
  reports.push({ label, violations });
  await writeFile("artifacts/workspace-accessibility.json", JSON.stringify(reports, null, 2));
  assert.deepEqual(violations, [], `${label}: accessibility failures (see artifacts/workspace-accessibility.json)`);
}
function watch(page) { page.on("pageerror", (error) => browserErrors.push(error.message)); }

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await desktop.newPage();
  watch(page);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".dashboard-heading h1")).toContainText("Chào bạn");
  await expect(page.locator(".dashboard-metric .metric-value").first()).toHaveText("0");
  await noOverflow(page, "desktop overview");
  await page.screenshot({ path: "artifacts/workspace-desktop.png", fullPage: true });
  await page.screenshot({ path: "artifacts/workspace-desktop-viewport.png" });
  await accessibility(page, "desktop overview");

  // Real database flow: selected weekly date -> prefilled form -> persisted plan.
  await page.getByRole("button", { name: "Tuần sau", exact: true }).click();
  await page.locator(".schedule-day").nth(2).click();
  const selected = await page.locator(".schedule-day.is-selected").getAttribute("data-date");
  await page.locator(".day-agenda-heading > button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Ngày dự kiến")).toHaveValue(selected);
  const title = `Responsive UI regression ${Date.now()}`;
  await page.getByLabel("Tiêu đề nội dung").fill(title);
  await page.getByLabel("Ghi chú & kịch bản").fill("Temporary plan created by the responsive test; deleted afterwards.");
  const save = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/plans" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Lưu nội dung", exact: true }).click();
  const saved = await save;
  assert.equal(saved.status(), 201);
  const plan = await saved.json();
  created.push({ context: desktop, id: plan.id });
  assert.equal(plan.scheduledDate, selected);
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.locator(".creator-brand").click();
  await expect(page.locator(".dashboard-recent strong").filter({ hasText: title })).toBeVisible();

  // Command-K searches real records and opens the actual edit dialog.
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "Tìm kiếm toàn bộ không gian" })).toBeFocused();
  await page.getByRole("combobox").fill(title);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByLabel("Tiêu đề nội dung")).toHaveValue(title);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("lich");
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toHaveAttribute("data-view", "planner");

  await page.locator(".desktop-quick-create").click();
  await expect(page.locator(".creator-create-options > button")).toHaveCount(4);
  await page.getByRole("dialog").getByRole("button", { name: /Mở phòng dựng/ }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "editor");
  const image = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#d9bcf4" } }).png().toBuffer();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "responsive-test.png", mimeType: "image/png", buffer: image });
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(() => page.locator("canvas").evaluate((canvas) => canvas.getContext("2d").getImageData(10, 10, 1, 1).data[0])).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Cắt & xoay", exact: true }).click();
  await page.getByRole("button", { name: "9:16 · Shorts 1080x1920", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("width", "1080");
  await expect(page.locator("canvas")).toHaveAttribute("height", "1920");
  await page.getByRole("button", { name: "Chữ & tiêu đề", exact: true }).click();
  await page.getByRole("button", { name: "Thêm chữ tiêu đề", exact: true }).click();
  await noOverflow(page, "desktop editor with imported media");

  await page.goto(`${base}/?view=studio&tab=upload`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Đăng video đã được kiểm duyệt chính sách" })).toBeVisible();
  await noOverflow(page, "Studio upload deep link");
  console.log("PASS: weekly planner persistence, command search, quick-create, image import/crop/text and Studio deep link");

  // Standalone PWA state is emulated; this does not claim installation on a physical phone.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await mobile.addInitScript(() => Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true }));
  const phone = await mobile.newPage();
  watch(phone);
  await phone.goto(base, { waitUntil: "networkidle" });
  await phone.evaluate(() => document.fonts.ready);
  await expect(phone.locator(".creator-shell")).toHaveAttribute("data-app-mode", "standalone");
  await expect(phone.locator(".mobile-tabbar")).toBeVisible();
  await expect(phone.locator(".creator-sidebar")).toBeHidden();
  await noOverflow(phone, "mobile standalone overview");
  await phone.screenshot({ path: "artifacts/workspace-mobile.png", fullPage: true });
  await phone.screenshot({ path: "artifacts/workspace-mobile-viewport.png" });
  await accessibility(phone, "mobile standalone overview");
  await phone.getByRole("button", { name: "Mở tất cả công cụ" }).click();
  await expect(phone.locator(".navigation-sheet-grid > button")).toHaveCount(7);
  await accessibility(phone, "mobile tools sheet");
  await phone.locator(".navigation-sheet-grid").getByRole("button", { name: "Phòng dựng" }).click();
  await expect(phone.locator("main")).toHaveAttribute("data-view", "editor");
  await phone.getByRole("button", { name: "Tạo nhanh nội dung" }).click();
  await phone.getByRole("dialog").getByRole("button", { name: /Ghi lại một ý tưởng/ }).click();
  await expect(phone.getByRole("dialog").getByRole("heading", { name: "Ghi lại ý tưởng mới" })).toBeVisible();
  await phone.keyboard.press("Escape");
  await phone.getByRole("button", { name: "Tìm kiếm nhanh" }).click();
  await phone.getByRole("combobox").fill("phan tich");
  await phone.keyboard.press("Enter");
  await expect(phone.locator("main")).toHaveAttribute("data-view", "analytics");
  console.log("PASS: standalone mobile navigation, all-tools sheet, quick-create and accent-insensitive search");

  const views = ["overview", "planner", "ideas", "editor", "studio", "strategy", "monetization", "analytics", "settings", "connections"];
  for (const width of [1440, 1280, 1024, 768, 390, 360, 320]) {
    const context = width >= 1100 ? desktop : mobile;
    const screen = await context.newPage();
    watch(screen);
    await screen.setViewportSize({ width, height: width > 800 ? 950 : 844 });
    for (const view of views) {
      await screen.goto(`${base}/?view=${view}`, { waitUntil: "domcontentloaded" });
      await expect(screen.locator("main")).toHaveAttribute("data-view", view);
      await screen.evaluate(() => document.fonts.ready);
      await screen.waitForTimeout(120);
      await noOverflow(screen, `${width}px ${view}`);
    }
    await screen.close();
    console.log(`PASS: all ${views.length} views fit at ${width}px`);
  }
  const manifest = await (await desktop.request.get(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url.includes("view=editor")));
  assert.deepEqual(browserErrors, [], "browser runtime errors");
  console.log("PASS: manifest shortcuts, no horizontal overflow, no browser runtime errors");
} finally {
  for (const item of created) {
    await item.context.request.delete(`${base}/api/plans/${item.id}`).catch(() => undefined);
  }
  await browser.close();
}
