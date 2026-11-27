/**
 * End-to-end test of the LMS in a real browser (Playwright, no test runner needed).
 * Covers the full course lifecycle across all three roles, plus security checks.
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
const PW = "eduwave2026"; // sample-data password (see scripts/seed.ts)
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const seen = (loc, timeout = 10000) => loc.first().waitFor({ timeout }).then(() => true, () => false);
const pad = (n) => String(n).padStart(2, "0");
const localDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const dir = mkdtempSync(join(tmpdir(), "eduwave-e2e-"));
const REPORT = join(dir, "report.pdf");
writeFileSync(REPORT, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const run = Date.now().toString().slice(-5);
const SID = `25CS${run}`;
const CODE = `CS${run.slice(-3)}`;
let tempPassword = "";
let courseUrl = "";
let assignmentId = "";
let submissionFileHref = "";

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  return ctx.newPage();
}
async function signIn(page, identifier, password = PW) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email or student ID").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
const dialog = (page) => page.locator("dialog[open]");

let page;
try {
  /* ------------------------------ public ------------------------------ */
  page = await newPage();
  const h = (await page.request.get(`${BASE}/`)).headers();
  check("security headers (CSP, X-Frame-Options, nosniff)", h["content-security-policy"]?.includes("frame-ancestors 'none'") && h["x-frame-options"] === "DENY" && h["x-content-type-options"] === "nosniff");
  await page.goto(`${BASE}/`);
  check("landing page presents the LMS", await seen(page.getByRole("heading", { name: /university courses/i })));
  const r = await page.request.get(`${BASE}/instructor/courses`, { maxRedirects: 0 });
  check("signed-out visitors are redirected to login (with next=)", r.status() === 307 && r.headers().location.includes("/login?next=%2Finstructor%2Fcourses"));

  /* ------------------------------ admin ------------------------------ */
  await signIn(page, "admin@eduwave.edu");
  await page.waitForURL(`${BASE}/admin`);
  check("admin signs in → overview", await seen(page.getByText("Students").first()));

  await page.goto(`${BASE}/admin/users`);
  await page.getByRole("button", { name: "New user" }).click();
  await dialog(page).getByLabel("Full name").fill("Test Student");
  await dialog(page).getByLabel("Email").fill(`test.${run}@student.eduwave.edu`);
  await dialog(page).getByLabel("Student ID").fill(SID);
  await dialog(page).getByRole("button", { name: "Create account" }).click();
  const created = await dialog(page).getByText(/Temporary password:/).first().innerText({ timeout: 10000 });
  tempPassword = created.match(/Temporary password: (\S+)/)?.[1] ?? "";
  check("admin creates student with one-time temp password", /^[a-z]+-[a-z]+-\d{4}$/.test(tempPassword), tempPassword);
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/admin/courses`);
  await page.getByLabel("Code").fill(CODE);
  await page.getByLabel("Title").fill(`E2E Testing ${run}`);
  await page.getByLabel("Department").fill("Computer Science & Engineering");
  await page.getByLabel("Term").fill("Autumn 2026");
  await page.getByLabel("Instructor").selectOption({ label: "Dr. Meera Iyer" });
  await page.getByLabel("Weekly sections").fill("3");
  await page.getByRole("button", { name: "Create course" }).click();
  check("admin creates course with weekly sections", await seen(page.getByRole("cell", { name: new RegExp(CODE) })));
  await page.context().close();

  /* ---------------------------- instructor ---------------------------- */
  page = await newPage();
  await signIn(page, "meera.iyer@eduwave.edu");
  await page.waitForURL(`${BASE}/instructor`);
  await page.goto(`${BASE}/instructor/courses`);
  await page.getByText(`E2E Testing ${run}`).click();
  await page.waitForURL(/\/instructor\/courses\/[0-9a-f-]{36}/);
  courseUrl = page.url().split("#")[0];
  check("instructor sees the new course with Week 1–3", (await seen(page.getByText("Week 1"))) && (await seen(page.getByText("Week 3"))));

  // Settings: open self-enrolment
  await page.getByRole("tab", { name: /Settings/ }).click();
  await page.getByLabel("Enrolment key").fill(`key-${run}`);
  await page.getByRole("button", { name: "Save settings" }).click();
  check("instructor sets an enrolment key", await seen(page.getByText("Course settings saved.")));

  // Content: add a link material to Week 1
  await page.getByRole("tab", { name: /Content/ }).click();
  const mat = page.locator("section", { hasText: "Add material" });
  await mat.getByRole("radio", { name: "Web link" }).click();
  await mat.getByLabel("Title").fill("Reading: testing pyramid");
  await mat.getByLabel("URL").fill("https://en.wikipedia.org/wiki/Software_testing");
  await mat.getByRole("button", { name: "Add to course" }).click();
  check("instructor adds material to a section", await seen(page.getByText("Reading: testing pyramid")));

  // Assignment
  await page.goto(`${courseUrl}/assignments/new`);
  await page.getByLabel("Title").fill(`Lab ${run}`);
  await page.locator("textarea").fill("### Task\nWrite **three** unit tests.");
  await page.locator("input[name=dueAt]").fill(localDT(new Date(Date.now() + 2 * 86_400_000)));
  await page.getByLabel("Maximum points").fill("10");
  await page.getByRole("button", { name: /Publish/ }).click();
  await page.waitForURL(/\/instructor\/assignments\/[0-9a-f-]{36}$/, { timeout: 15000 });
  assignmentId = page.url().split("/").pop();
  check("instructor publishes an assignment", await seen(page.getByRole("heading", { name: `Lab ${run}` })));

  // Quiz
  await page.goto(`${courseUrl}/quizzes/new`);
  await page.getByLabel("Title").fill(`Quiz ${run}`);
  await page.getByLabel("Time limit (minutes)").fill("5");
  await page.locator("input[name=deadline]").fill(localDT(new Date(Date.now() + 86_400_000)));
  await page.locator("form textarea").nth(0).fill("2 + 2 = ?");
  await page.getByPlaceholder("Option 1").first().fill("4");
  await page.getByPlaceholder("Option 2").first().fill("5");
  await page.getByLabel("Option 1 is correct").first().check();
  await page.getByRole("button", { name: "Add question" }).click();
  await page.locator("form textarea").nth(1).fill("Capital of India?");
  await page.getByPlaceholder("Option 1").nth(1).fill("Mumbai");
  await page.getByPlaceholder("Option 2").nth(1).fill("New Delhi");
  await page.getByLabel("Option 2 is correct").nth(1).check();
  await page.getByRole("button", { name: /Publish quiz/ }).click();
  await page.waitForURL(/\/instructor\/quizzes\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const quizId = page.url().split("/").pop();
  check("instructor publishes a quiz", await seen(page.getByText("Export CSV")));

  // Announcement
  await page.goto(`${courseUrl}#discussions`);
  await page.getByRole("tab", { name: /Discussions/ }).click();
  const post = page.locator("section", { hasText: "New post or announcement" });
  await post.getByLabel("Title").fill(`Welcome to ${CODE}`);
  await post.getByLabel("Message").fill("Office hours are **Tuesdays 3–4 pm**.");
  await post.getByLabel(/Post as announcement/).check();
  await post.getByRole("button", { name: "Post" }).click();
  await page.waitForURL(/\/discussions\/[0-9a-f-]{36}$/);
  check("instructor posts an announcement", await seen(page.getByText("Announcement").first()));
  await page.context().close();

  /* ------------------------------ student ------------------------------ */
  page = await newPage();
  await signIn(page, SID.toLowerCase(), tempPassword); // student IDs are case-insensitive
  await page.waitForURL(/\/student\/account\?required=1/);
  check("temp password → forced to choose own password", await seen(page.getByText("Choose your own password to continue")));
  await page.getByLabel("Current password").fill(tempPassword);
  await page.getByLabel("New password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm new password").fill("password123");
  await page.getByRole("button", { name: "Update password" }).click();
  check("weak/common password rejected", await seen(page.getByText(/at least 10 characters|too common/)));
  await page.getByLabel("New password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Confirm new password").fill("correct horse battery");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL(`${BASE}/student`);
  check("strong password accepted → dashboard", true);

  // Self-enrol from the catalogue
  await page.goto(`${BASE}/student/catalog`);
  const card = page.locator("article", { hasText: `E2E Testing ${run}` });
  await card.getByRole("button", { name: /Enrol with key/ }).click();
  await dialog(page).getByLabel("Enrolment key").fill("wrong-key");
  await dialog(page).getByRole("button", { name: "Enrol" }).click();
  check("wrong enrolment key rejected", await seen(dialog(page).getByText("isn't correct")));
  await dialog(page).getByLabel("Enrolment key").fill(`key-${run}`);
  await dialog(page).getByRole("button", { name: "Enrol" }).click();
  await page.waitForURL(/\/student\/courses\/[0-9a-f-]{36}/, { timeout: 15000 });
  check("correct key enrols and opens the course", await seen(page.getByText("Reading: testing pyramid")));

  // Completion tracking
  await page.getByRole("checkbox", { name: "Mark as done" }).first().click();
  await page.waitForTimeout(800);
  await page.reload();
  check("marking material done updates progress", await seen(page.getByRole("img", { name: /Course progress: [1-9]\d*%/ })));

  // Assignment submission with a file
  await page.goto(`${BASE}/student/assignments/${assignmentId}`);
  await page.getByLabel("Online text").fill("My tests: `testAdd`, `testSub`, `testMul`.");
  await page.locator('input[type="file"]').setInputFiles(REPORT);
  await page.getByRole("button", { name: "Submit assignment" }).click();
  check("student submits assignment (text + file)", await seen(page.getByText(/Submitted/).first()));
  await page.reload();
  submissionFileHref = await page.getByRole("link", { name: /report\.pdf/ }).first().getAttribute("href");

  // Quiz
  await page.goto(`${BASE}/student/quizzes/${quizId}`);
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByText("Time left").waitFor();
  check("answer key NOT in page payload during attempt", !/correctIndex\\?"?:\s*\d/.test(await page.content()));
  for (let i = 0; i < 2; i++) {
    const prompt = await page.locator("h2").filter({ hasText: /\?$/, visible: true }).first().innerText();
    await page.getByText(prompt.startsWith("2 + 2") ? "4" : "Mumbai", { exact: true }).filter({ visible: true }).click(); // 1 right, 1 wrong
    await page.getByText("Saved").filter({ visible: true }).waitFor();
    if (i === 0) await page.getByRole("button", { name: /Next/ }).click();
  }
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit" }).click();
  check("server-graded quiz score 1 / 2", await seen(page.getByText("1 / 2")));

  // Discussion reply + announcement visible
  await page.goto(`${courseUrl.replace("/instructor/", "/student/")}`);
  await page.getByRole("tab", { name: /Discussions/ }).click();
  const ann = page.getByText(`Welcome to ${CODE}`).filter({ visible: true });
  check("student sees the announcement", await seen(ann));
  await ann.first().click();
  await page.getByLabel("Reply").fill("Thank you!");
  await page.getByRole("button", { name: "Post reply" }).click();
  check("student replies in discussion", await seen(page.getByText("Thank you!")));

  // Calendar
  await page.goto(`${BASE}/student/calendar`);
  check("calendar lists the new assignment", await seen(page.getByText(`Lab ${run}`)));

  // Security: student can't reach instructor pages or exports
  const exp = await page.request.get(`${courseUrl}/gradebook/export`);
  check("student blocked from gradebook export", exp.status() === 401 || !exp.headers()["content-type"]?.includes("csv"));
  await page.goto(`${BASE}/instructor`);
  check("student visiting /instructor is redirected", await page.waitForURL(`${BASE}/student`, { timeout: 8000 }).then(() => true, () => false));
  const ownFile = await page.request.get(`${BASE}${submissionFileHref}`);
  check("student can download own submission file", ownFile.status() === 200);
  await page.context().close();

  // Another student must NOT be able to read that submission file or the course
  const other = await newPage();
  await signIn(other, "24CS1002");
  await other.waitForURL(`${BASE}/student`);
  const peek = await other.request.get(`${BASE}${submissionFileHref}`);
  check("other student can't download someone else's submission", peek.status() === 404);
  await other.goto(courseUrl.replace("/instructor/", "/student/"));
  check("non-enrolled student gets 404 for the course", await seen(other.getByText("Not found")));
  await other.context().close();

  /* --------------------------- instructor grades --------------------------- */
  page = await newPage();
  await signIn(page, "meera.iyer@eduwave.edu");
  await page.waitForURL(`${BASE}/instructor`);
  check("grading queue shows the submission", await seen(page.getByText(`Lab ${run}`)));
  await page.goto(`${BASE}/instructor/assignments/${assignmentId}`);
  const sub = page.locator("details", { hasText: "Test Student" });
  if (!(await sub.evaluate((d) => d.open))) await sub.locator("summary").click();
  // Bypass the browser's own max= check to prove the SERVER enforces the limit.
  await sub.getByLabel(/Points/).evaluate((el) => el.removeAttribute("max"));
  await sub.getByLabel(/Points/).fill("12");
  await sub.getByRole("button", { name: "Save grade" }).click();
  check("server rejects grade above maximum", await seen(sub.getByText("Maximum is 10 points.")));
  await sub.getByLabel(/Points/).fill("9");
  await sub.getByLabel("Feedback").fill("Good coverage. Add an edge case for overflow.");
  await sub.getByRole("button", { name: "Save grade" }).click();
  check("instructor grades with feedback", await seen(sub.getByText("9/10")));
  const csv = await page.request.get(`${courseUrl}/gradebook/export`);
  const csvText = await csv.text();
  check("gradebook CSV export includes the grade", csv.status() === 200 && csvText.includes(SID) && csvText.includes("9"));
  await page.context().close();

  // Another instructor can't open Meera's course
  page = await newPage();
  await signIn(page, "rahul.verma@eduwave.edu");
  await page.waitForURL(`${BASE}/instructor`);
  await page.goto(courseUrl);
  check("other instructor gets 404 for the course", await seen(page.getByText("Not found")));
  await page.context().close();

  /* -------------------------- student sees grade -------------------------- */
  page = await newPage();
  await signIn(page, SID, "correct horse battery");
  await page.waitForURL(`${BASE}/student`);
  const notes = await (await page.request.get(`${BASE}/api/notifications`)).json();
  check("student notified of the grade", notes.items.some((n) => /graded/.test(n.title)), `unread=${notes.unread}`);
  await page.goto(`${BASE}/student/assignments/${assignmentId}`);
  check("student sees grade and feedback", (await seen(page.getByText("9 / 10"))) && (await seen(page.getByText(/edge case for overflow/))));
  await page.goto(`${BASE}/student/grades`);
  check("grades page shows a course total", await seen(page.getByRole("cell", { name: CODE })));
  await page.context().close();

  /* ----------------------- admin deactivates account ----------------------- */
  const studentPage = await newPage();
  await signIn(studentPage, SID, "correct horse battery");
  await studentPage.waitForURL(`${BASE}/student`);
  page = await newPage();
  await signIn(page, "admin@eduwave.edu");
  await page.waitForURL(`${BASE}/admin`);
  await page.goto(`${BASE}/admin/users?q=${SID}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Deactivate Test Student/ }).click();
  check("admin deactivates the account", await seen(page.getByText("Deactivated")));
  await studentPage.goto(`${BASE}/student`);
  check("deactivated user's live session is revoked", await studentPage.waitForURL(/\/login/, { timeout: 8000 }).then(() => true, () => false));
  await signIn(studentPage, SID, "correct horse battery");
  check("deactivated user can't sign in", await seen(studentPage.getByText("Incorrect email/ID or password.")));
  await page.goto(`${BASE}/admin/audit`);
  check("audit log records the deactivation", await seen(page.getByText("user deactivated")));
  await page.context().close();
  await studentPage.context().close();

  /* ------------------------------- lockout ------------------------------- */
  page = await newPage();
  for (let i = 0; i < 5; i++) {
    await signIn(page, "24CS1003", `wrong-${i}`);
    await page.getByText("Incorrect email/ID or password.").waitFor();
  }
  await signIn(page, "24CS1003");
  check("account locked after 5 failures (even with right password)", await seen(page.getByText(/Too many failed attempts/)));
} catch (err) {
  check("unexpected error", false, err.message.split("\n")[0]);
  if (page) {
    await page.screenshot({ path: join(dir, "failure.png"), fullPage: true }).catch(() => {});
    console.log("URL at failure:", page.url(), "\nScreenshot:", join(dir, "failure.png"));
  }
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
