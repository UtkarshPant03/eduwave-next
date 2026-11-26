/**
 * End-to-end test of the main flows in a real browser (Playwright, no test runner needed).
 *
 * Run against a FRESH seeded database and a running production server:
 *   rm -rf .pglite && npm run db:migrate && npm run db:seed
 *   npm run build && npm start -- -p 3100        (OLLAMA_URL unset)
 *   npm run test:e2e
 *
 * Uses an installed browser instead of downloading one: Edge by default (preinstalled
 * on Windows). Set BROWSER_CHANNEL=chrome to use Google Chrome. BASE_URL overrides the server.
 */
import { chromium } from "playwright-core";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const seen = (loc, timeout = 8000) => loc.first().waitFor({ timeout }).then(() => true, () => false);
const pad = (n) => String(n).padStart(2, "0");
const localDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Test files (in a temp dir): a real minimal PDF and an HTML file disguised as a PDF.
const dir = mkdtempSync(join(tmpdir(), "eduwave-e2e-"));
const NOTES = join(dir, "notes.pdf");
const EVIL = join(dir, "evil.pdf");
writeFileSync(NOTES, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
writeFileSync(EVIL, "<html><script>alert(1)</script></html>");

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const run = Date.now().toString().slice(-5);
const roll = `T${run}`;
let tempPassword = "";
let quizId = "";

async function loginTeacher() {
  await page.goto(`${BASE}/login`);
  const card = page.locator("section", { hasText: "Teacher" }).last();
  await card.getByLabel("Email").fill("teacher@example.com");
  await card.getByLabel("Password").fill("teacher123");
  await card.getByRole("button", { name: "Log in as teacher" }).click();
  await page.waitForURL(`${BASE}/teacher`);
}
async function loginStudent(r, pw) {
  await page.goto(`${BASE}/login`);
  const card = page.locator("section", { hasText: "Student" }).first();
  await card.getByLabel("Roll number").fill(r);
  await card.getByLabel("Password").fill(pw);
  await card.getByRole("button", { name: "Log in as student" }).click();
}
async function logout() {
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(`${BASE}/login`);
}

try {
  // ---------- Security headers ----------
  const res = await page.request.get(`${BASE}/`);
  const h = res.headers();
  check("security headers (CSP, X-Frame-Options, nosniff)", h["content-security-policy"]?.includes("frame-ancestors 'none'") && h["x-frame-options"] === "DENY" && h["x-content-type-options"] === "nosniff");
  check("no X-Powered-By header", !h["x-powered-by"]);

  // ---------- Teacher ----------
  await loginTeacher();
  check("teacher dashboard with stat tiles", await seen(page.getByText("Open quizzes").first()));
  check("class card counts are correct (3 students · 2 quizzes)", await seen(page.getByText("3 students · 2 quizzes")));
  await page.getByRole("link", { name: /Class 10-A/ }).first().click();
  await page.waitForURL(/\/teacher\/classes\/[0-9a-f-]{36}/);
  const classUrl = page.url().split("#")[0];
  check("quiz table: seeded past quiz shows 3 / 3 submitted, 75% avg", (await seen(page.getByRole("cell", { name: "3 / 3" }))) && (await seen(page.getByRole("cell", { name: "75%" }))));

  // Students tab: add via dialog, get one-time temp password
  await page.getByRole("tab", { name: /Students/ }).click();
  await page.getByRole("button", { name: "Add student" }).first().click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel("Full name").fill("Test Student");
  await dlg.getByLabel("Roll number").fill(roll);
  await dlg.getByRole("button", { name: "Add student" }).click();
  const okText = await dlg.getByText(/Temporary password:/).first().innerText({ timeout: 8000 });
  tempPassword = okText.match(/Temporary password: (\S+)/)?.[1] ?? "";
  check("add student returns one-time temp password", /^[a-z]+-[a-z]+-\d{4}$/.test(tempPassword), tempPassword);
  await page.keyboard.press("Escape");

  // Resources tab: real PDF accepted, disguised HTML rejected, javascript: link rejected
  await page.getByRole("tab", { name: /Resources/ }).click();
  const resCard = page.locator("section", { hasText: "Share something" });
  await resCard.getByLabel("Title").fill("Chapter notes");
  await resCard.getByLabel("Subject").fill("Science");
  await resCard.locator('input[type="file"]').setInputFiles(EVIL);
  await resCard.getByRole("button", { name: "Share with class" }).click();
  check("upload: HTML disguised as PDF rejected", await seen(resCard.getByText("contents don't match")));
  await resCard.locator('input[type="file"]').setInputFiles(NOTES);
  await resCard.getByRole("button", { name: "Share with class" }).click();
  check("upload: real PDF accepted", await seen(page.getByText("notes.pdf ·")));
  await resCard.getByRole("radio", { name: "Web link" }).click();
  await resCard.getByLabel("Title").fill("Evil");
  await resCard.getByLabel("Subject").fill("X");
  await resCard.getByLabel("URL").evaluate((el) => (el.type = "text"));
  await resCard.getByLabel("URL").fill("javascript:alert(1)");
  await resCard.getByRole("button", { name: "Share with class" }).click();
  check("javascript: link rejected", await seen(resCard.getByText("Enter a full http(s) link.")));

  // Live tab: schedule a class starting in 5 minutes → joinable Jitsi link
  await page.getByRole("tab", { name: /Live classes/ }).click();
  const liveCard = page.locator("section", { hasText: "Schedule a live class" });
  await liveCard.getByLabel("Topic").fill(`Live ${run}`);
  await liveCard.getByLabel("Starts at").fill(localDT(new Date(Date.now() + 5 * 60_000)));
  await liveCard.getByRole("button", { name: /Schedule/ }).click();
  const startLink = page.getByRole("link", { name: "Start" }).first();
  check("live class scheduled with Jitsi link", (await seen(page.getByText(`Live ${run}`))) && /^https:\/\/meet\.jit\.si\/eduWave-/.test((await startLink.getAttribute("href")) ?? ""));

  // Create quiz (shuffled)
  await page.goto(`${classUrl}/quizzes/new`);
  await page.getByLabel("Title").fill(`E2E Quiz ${run}`);
  await page.getByLabel("Subject").fill("Science");
  await page.getByLabel("Time limit (minutes)").fill("2");
  await page.locator("input[name=deadline]").fill(localDT(new Date(Date.now() + 24 * 3600 * 1000)));
  await page.locator("form textarea").nth(0).fill("Water boils at (sea level)?");
  await page.getByPlaceholder("Option 1").first().fill("100 °C");
  await page.getByPlaceholder("Option 2").first().fill("50 °C");
  await page.getByLabel("Option 1 is correct").first().check();
  await page.getByRole("button", { name: "Add question" }).click();
  await page.locator("form textarea").nth(1).fill("Chemical symbol for gold?");
  await page.getByPlaceholder("Option 1").nth(1).fill("Ag");
  await page.getByPlaceholder("Option 2").nth(1).fill("Au");
  await page.getByLabel("Option 2 is correct").nth(1).check();
  await page.getByRole("button", { name: /Publish quiz/ }).click();
  await page.waitForURL(/\/teacher\/quizzes\/[0-9a-f-]{36}$/, { timeout: 15000 });
  quizId = page.url().split("/").pop();
  check("quiz published → analytics", await seen(page.getByText("Export CSV")));
  const csv = await page.request.get(`${BASE}/teacher/quizzes/${quizId}/export`);
  check("CSV export works for owner", csv.status() === 200 && csv.headers()["content-type"].startsWith("text/csv"));
  await logout();

  // ---------- New student: forced password change ----------
  await loginStudent(roll, tempPassword);
  await page.waitForURL(/\/student\/account\?required=1/);
  check("temp password → forced to change password", await seen(page.getByText("Choose your own password to continue")));
  await page.goto(`${BASE}/student`);
  check("can't use app before changing password", await page.waitForURL(/\/student\/account/, { timeout: 8000 }).then(() => true, () => false));
  await page.getByLabel("Current password").fill(tempPassword);
  await page.getByLabel("New password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm new password").fill("password123");
  await page.getByRole("button", { name: "Update password" }).click();
  check("weak/common password rejected", await seen(page.getByText("at least 10 characters")));
  await page.getByLabel("New password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Confirm new password").fill("correct horse battery");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL(`${BASE}/student`, { timeout: 10000 });
  check("strong password accepted → dashboard", true);

  const notif = await (await page.request.get(`${BASE}/api/notifications`)).json();
  check("in-app notifications for new quiz/resource/live", notif.unread >= 3, `unread=${notif.unread}`);

  // File download as class member
  const fileHref = await (async () => {
    await page.goto(`${BASE}/student/resources`);
    return page.getByRole("link", { name: /Chapter notes/ }).first().getAttribute("href");
  })();
  const file = await page.request.get(`${BASE}${fileHref}`);
  check("student can download class file (pdf, nosniff)", file.status() === 200 && file.headers()["content-type"] === "application/pdf" && file.headers()["x-content-type-options"] === "nosniff");

  // Take the quiz
  await page.goto(`${BASE}/student/quizzes/${quizId}`);
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByText("Time left").waitFor();
  const html = await page.content();
  check("answer key NOT in page payload during attempt", !/correctIndex\\?"?:\s*\d/.test(html));
  // Questions are shuffled, so answer by content.
  for (let i = 0; i < 2; i++) {
    const prompt = await page.locator("h2").filter({ hasText: /\?$/, visible: true }).first().innerText();
    await page.getByText(prompt.includes("Water") ? "100 °C" : "Ag", { exact: true }).filter({ visible: true }).click(); // 1 right, 1 wrong
    await page.getByText("Saved").filter({ visible: true }).waitFor();
    if (i === 0) await page.getByRole("button", { name: /Next/ }).click();
  }
  await page.reload();
  check("answers persist across reload", await seen(page.getByText("2 of 2 answered")));
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByText("Your score").waitFor();
  check("server-graded score 1 / 2 (with shuffle mapping)", await seen(page.getByText("1 / 2")));
  check("answers hidden until deadline", await seen(page.getByText(/appear after the deadline/)));

  // Whiteboard: create, draw a rectangle, autosave
  await page.goto(`${BASE}/student/boards`);
  await page.getByPlaceholder(/New board title/).fill("My diagram");
  await page.getByRole("button", { name: "New board" }).click();
  await page.waitForURL(/\/student\/boards\/[0-9a-f-]{36}/);
  const boardUrl = page.url();
  const canvas = page.locator("canvas.interactive, .excalidraw canvas").last();
  check("whiteboard (Excalidraw) loads", await seen(canvas, 15000));
  await page.keyboard.press("r");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 320, { steps: 8 });
  await page.mouse.up();
  check("whiteboard autosaves", await seen(page.getByText("Saved", { exact: true }), 10000) && (await page.getByText("Saved", { exact: true }).isVisible()));
  await page.waitForTimeout(2500);
  await page.reload();
  const saved = await page.request.get(boardUrl);
  check("whiteboard reloads", saved.status() === 200);

  await page.goto(`${BASE}/student/tutor`);
  check("AI tutor shows setup message when Ollama is off", await seen(page.getByText(/isn.t switched on/)));

  await page.goto(`${BASE}/student/stats`);
  check("progress page renders charts", await seen(page.locator(".recharts-surface")));
  await page.goto(`${BASE}/student/account`);
  check("security page lists sessions & activity", (await seen(page.getByText("This device"))) && (await seen(page.getByText("Password changed"))));
  await logout();

  // ---------- Seeded student: revealed answers, explanations, podium ----------
  await loginStudent("S001", "student123");
  await page.waitForURL(`${BASE}/student`);
  await page.getByText("Cells & organisms").first().click();
  check("after deadline: answers + explanations revealed", await seen(page.getByText("Why:")));
  await page.goto(`${BASE}/student/leaderboard`);
  check("leaderboard podium", await seen(page.getByLabel("Top three")));
  // Another user's board must not be reachable
  const other = await page.request.get(boardUrl.replace("/student/", "/student/"));
  const otherText = await other.text();
  check("other student's board → not found", otherText.includes("Not found") || other.status() === 404);
  // Student can't download teacher export
  const exp = await page.request.get(`${BASE}/teacher/quizzes/${quizId}/export`);
  check("student blocked from CSV export", exp.status() === 401 || exp.url().includes("/student"));
  await logout();

  // ---------- Lockout ----------
  for (let i = 0; i < 5; i++) {
    await loginStudent("S002", "wrong-password-" + i);
    await page.getByText("Incorrect login details.").waitFor();
  }
  await loginStudent("S002", "student123");
  check("account locked after 5 failures (even with right password)", await seen(page.getByText(/Too many failed attempts/)));

  // ---------- Teacher sees result & security log ----------
  await loginTeacher();
  await page.goto(`${BASE}/teacher/quizzes/${quizId}`);
  check("teacher analytics: 1 submission + distribution chart", (await seen(page.getByText(/^1 \/ \d+$/))) && (await seen(page.locator(".recharts-surface"))));
  await page.goto(`${BASE}/teacher/account`);
  check("teacher audit log shows sign-ins", await seen(page.getByText("Signed in")));
} catch (err) {
  check("unexpected error", false, err.message.split("\n")[0]);
  await page.screenshot({ path: join(dir, "failure.png"), fullPage: true });
  console.log("Screenshot:", join(dir, "failure.png"));
  console.log("URL at failure:", page.url());
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
