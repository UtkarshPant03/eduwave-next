/**
 * Security regression tests: each check replays an attack from the production audit
 * (docs/PRODUCTION_AUDIT.md) and expects it to fail.
 *
 * Some attacks call Server Actions directly with crafted arguments, exactly as an attacker
 * would (action ids are public: they ship in the client bundle). We read the ids from the
 * build's server-reference-manifest.json, so run this against a server started from the
 * same build:
 *
 *   rm -rf .pglite && npm run db:migrate && npm run db:seed && npm run build
 *   EDUWAVE_ENV=local npm start -- -p 3100
 *   npm run test:security
 */
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = "eduwave2026";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const seen = (loc, timeout = 10000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
const actionId = (name) => Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];

/** Calls a Server Action with arbitrary arguments, using the page's session cookie. */
async function callAction(page, name, args, path) {
  const id = actionId(name);
  if (!id) throw new Error(`action ${name} not found in manifest`);
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
  return { status: res.status(), text: await res.text() };
}

const dir = mkdtempSync(join(tmpdir(), "eduwave-sec-"));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const run = Date.now().toString().slice(-5);

async function signIn(identifier, password = PW) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email or student ID").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}
const hrefOf = (page, prefix, text) => page.locator(`a[href^="${prefix}"]`).filter({ hasText: text }).first().getAttribute("href");

let page;
try {
  /* ---------------- SEC-01: mass assignment in thread moderation ---------------- */
  page = await signIn("meera.iyer@eduwave.edu");
  await page.goto(`${BASE}/instructor/courses`);
  const cs201 = await hrefOf(page, "/instructor/courses/", "Data Structures");
  const cs204 = await hrefOf(page, "/instructor/courses/", "Database Management");
  await page.goto(`${BASE}${cs201}`);
  const threadPath = await hrefOf(page, `${cs201}/discussions/`, "recursion vs iteration");
  const threadId = threadPath.split("/").pop();
  await callAction(page, "moderateThread", [threadId, { courseId: cs204.split("/").pop(), title: `HACKED ${run}`, isAnnouncement: true, pinned: true }], threadPath);
  await page.goto(`${BASE}${threadPath}`);
  check(
    "SEC-01 moderateThread ignores extra fields (thread not moved/retitled)",
    (await seen(page.getByRole("heading", { name: /recursion vs iteration/ }))) && (await page.getByText(`HACKED ${run}`).count()) === 0,
  );

  /* ---------------- SEC-13: deleteActivity must not leak other courses' data ---------------- */
  const lab2Id = (await (async () => {
    await page.goto(`${BASE}${cs201}`);
    return hrefOf(page, "/instructor/assignments/", "Lab 2");
  })()).split("/").pop();
  const leak = await callAction(page, "deleteActivity", [cs204.split("/").pop(), "assignment", lab2Id], cs204);
  check("SEC-13 deleteActivity reveals nothing about another course's activity", !/students? ha(s|ve)/.test(leak.text) && /no longer exists/.test(leak.text));

  /* ---------------- privilege: instructor can't call admin actions ---------------- */
  await callAction(page, "setCoursePublished", [cs201.split("/").pop(), false], "/instructor");
  await page.context().close();
  const stu = await signIn("24CS1001");
  await stu.goto(`${BASE}${cs201.replace("/instructor/", "/student/")}`);
  check("instructor can't call an admin action (course stays published)", await seen(stu.getByRole("heading", { name: "Data Structures and Algorithms" })));

  /* ---------------- SEC-02: unpublished courses stay private ---------------- */
  await stu.goto(`${BASE}/student/calendar`);
  const before = await stu.getByText("CS204").count();
  const admin = await signIn("admin@eduwave.edu");
  await callAction(admin, "setCoursePublished", [cs204.split("/").pop(), false], "/admin/courses");
  await stu.goto(`${BASE}/student/calendar`);
  await stu.waitForLoadState("networkidle");
  const after = await stu.getByText("CS204").count();
  await callAction(admin, "setCoursePublished", [cs204.split("/").pop(), true], "/admin/courses");
  check("SEC-02 hidden course disappears from students' calendar", before > 0 && after === 0, `before ${before}, after ${after}`);

  /* ---------------- SEC-10 / SEC-09: uploads ---------------- */
  await stu.goto(`${BASE}${cs201.replace("/instructor/", "/student/")}`);
  const lab5 = await hrefOf(stu, "/student/assignments/", "Lab 5");
  await stu.goto(`${BASE}${lab5}`);
  const fakeDocx = join(dir, "notes.docx");
  writeFileSync(fakeDocx, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("not really an office document")]));
  await stu.locator('input[type="file"]').setInputFiles(fakeDocx);
  await stu.getByRole("button", { name: /submi/i }).click();
  check("SEC-10 a ZIP renamed to .docx is rejected", await seen(stu.getByText("The file's contents don't match its extension.")));
  const pdf = join(dir, "answer.pdf");
  writeFileSync(pdf, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await stu.locator('input[type="file"]').setInputFiles(pdf);
  await stu.getByRole("button", { name: /submi/i }).click();
  await stu.getByText(/Submitted|updated/).first().waitFor();
  await stu.reload();
  const fileHref = await stu.getByRole("link", { name: /answer\.pdf/ }).first().getAttribute("href");
  await stu.context().close();
  const ins = await signIn("meera.iyer@eduwave.edu");
  const dl = await ins.request.get(`${BASE}${fileHref}`);
  check("SEC-09 a student's PDF downloads (attachment), never opens inline", dl.status() === 200 && /^attachment/.test(dl.headers()["content-disposition"] ?? ""), dl.headers()["content-disposition"]);
  await ins.context().close();

  /* ---------------- SEC-07: temporary passwords can't be used past the account page ---------------- */
  await admin.goto(`${BASE}/admin/users`);
  await admin.getByRole("button", { name: "New user" }).click();
  const dlg = admin.locator("dialog[open]");
  await dlg.getByLabel("Full name").fill("Temp Person");
  await dlg.getByLabel("Email").fill(`temp.${run}@student.eduwave.edu`);
  await dlg.getByLabel("Student ID").fill(`26SEC${run}`);
  await dlg.getByRole("button", { name: "Create account" }).click();
  const temp = (await dlg.getByText(/Temporary password:/).first().innerText()).match(/Temporary password: (\S+)/)[1];
  const tp = await signIn(`26SEC${run}`, temp);
  const api = await tp.request.get(`${BASE}/api/notifications`);
  await tp.goto(`${BASE}/student/calendar`);
  // Streamed pages redirect on the client, just after goto() returns: wait for it.
  const bounced = await tp.waitForURL(/\/student\/account\?required=1/, { timeout: 10000 }).then(() => true, () => false);
  check("SEC-07 temp-password session can't use APIs or shared pages", api.status() === 401 && bounced, `api ${api.status()}, page ${new URL(tp.url()).pathname}`);

  /* ---------------- SEC-08: password change rotates the session ---------------- */
  const oldCookies = await tp.context().cookies();
  await tp.getByLabel("Current password").fill(temp);
  await tp.getByLabel("New password", { exact: true }).fill("a much better passphrase");
  await tp.getByLabel(/Confirm/).fill("a much better passphrase");
  await tp.getByRole("button", { name: /Change password|Save password|Update password/ }).click();
  await tp.waitForURL(`${BASE}/student`);
  const thief = await browser.newContext();
  await thief.addCookies(oldCookies);
  const tPage = await thief.newPage();
  await tPage.goto(`${BASE}/student`);
  check("SEC-08 the old session cookie is dead after a password change", await tPage.waitForURL(/\/login/, { timeout: 10000 }).then(() => true, () => false));
  await thief.close();
  await tp.context().close();

  /* ---------------- SEC-12 / SEC-03: failed sign-ins ---------------- */
  const secretLooking = `MyPassw0rd!${run}`;
  const anon = await (await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "6.6.6.6" } })).newPage();
  await anon.goto(`${BASE}/login`);
  await anon.getByLabel("Email or student ID").fill(secretLooking);
  await anon.getByLabel("Password", { exact: true }).fill("whatever");
  await anon.getByRole("button", { name: "Sign in" }).click();
  await anon.getByText("Incorrect email/ID or password.").waitFor();
  await admin.goto(`${BASE}/admin/audit`);
  const auditText = await admin.locator("main").innerText();
  check("SEC-12 what was typed for an unknown account is not stored", !auditText.includes(secretLooking) && auditText.includes("unknown account"));
  check("SEC-03 a client-supplied X-Forwarded-For is not trusted", !auditText.includes("6.6.6.6"));
  await anon.context().close();
  await admin.context().close();
} catch (err) {
  check("unexpected error", false, err.message.split("\n")[0]);
  if (page) console.log("URL at failure:", page.url());
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
