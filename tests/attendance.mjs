/**
 * Phase 3: attendance. Instructor takes attendance for a class section, configures a
 * minimum, a student requests a correction, the instructor approves it. Permission
 * boundaries are replayed as crafted Server Action calls (ids from the build manifest):
 * a TA can't decide corrections; a student can't mark attendance.
 *
 * Run against a fresh seeded database and a server started from the same build:
 *   EDUWAVE_ENV=local npm start -- -p 3100   →   npm run test:attendance
 */
import { readFileSync } from "node:fs";
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
async function callAction(page, name, args, path) {
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { "Next-Action": actionId(name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
  return res.status();
}
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const run = Date.now().toString().slice(-5);
async function signIn(identifier) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email or student ID").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}
async function openCourseTab(page, role, title, tab) {
  await page.goto(`${BASE}/${role}/courses`);
  await page.getByText(title).first().click();
  await page.waitForURL(new RegExp(`/${role}/courses/[0-9a-f-]{36}`));
  await page.getByRole("tab", { name: new RegExp(tab) }).click();
  return new URL(page.url()).pathname.split("/")[3];
}

let page;
try {
  /* ----------------------------- instructor ----------------------------- */
  page = await signIn("meera.iyer@eduwave.edu");
  const courseId = await openCourseTab(page, "instructor", "Data Structures and Algorithms", "Attendance");
  check(
    "no minimum is assumed: none configured by default",
    await seen(page.getByText(/No minimum attendance configured/).filter({ visible: true })),
  );
  check(
    "seeded history: 2 absences in 3 classes shows 33%",
    await seen(page.getByRole("row").filter({ hasText: "24CS1004" }).filter({ hasText: "33%" })),
  );

  // Take attendance for section A only.
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Take attendance" }) });
  await form.getByLabel("Topic (optional)").fill(`Graphs ${run}`);
  await form.locator("select[name=sectionId]").selectOption({ label: "B.Tech CSE 2024 – A" });
  await form.getByRole("button", { name: "Take attendance" }).click();
  await page.waitForURL(/\/attendance\/[0-9a-f-]{36}$/);
  const sessionPath = new URL(page.url()).pathname;
  const sessionId = sessionPath.split("/").pop();
  // Visible rows only: the previous page stays mounted (hidden) for instant back-navigation.
  const rows = page.locator("tbody tr").filter({ visible: true });
  await rows.first().waitFor();
  check("the sheet lists only the section's students (6)", (await rows.count()) === 6, `${await rows.count()} rows`);
  const firstName = (await rows.nth(0).locator("td").first().innerText()).split("\n")[0];
  const secondName = (await rows.nth(1).locator("td").first().innerText()).split("\n")[0];
  await page.getByRole("radio", { name: `Absent for ${firstName}` }).check();
  await page.getByRole("radio", { name: `Late for ${secondName}` }).check();
  await page.getByRole("button", { name: "Save attendance" }).click();
  check("instructor saves the sheet", await seen(page.getByText("Attendance saved for 6 student(s).")));

  // Configure a minimum: the student with 2 absences is now flagged.
  await page.goto(`${BASE}/instructor/courses/${courseId}`);
  await page.getByRole("tab", { name: /Attendance/ }).click();
  const settings = page.locator("form").filter({ has: page.getByRole("button", { name: "Save settings" }) }).filter({ visible: true });
  await settings.getByLabel(/Minimum attendance/).fill("75");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await page.getByText("Attendance settings saved.").first().waitFor();
  await page.reload();
  await page.getByRole("tab", { name: /Attendance/ }).click();
  check("a configured minimum flags students below it", await seen(page.getByRole("row").filter({ hasText: "24CS1004" }).filter({ hasText: "Below minimum" })));

  /* ------------------------------- student ------------------------------- */
  const student = await signIn("24CS1004");
  await openCourseTab(student, "student", "Data Structures and Algorithms", "Attendance");
  check("the student sees their percentage and the minimum", await seen(student.getByText(/You are currently below it\./)));
  await student.getByRole("button", { name: /Request correction for/ }).first().click();
  const dlg = student.locator("dialog[open]");
  await dlg.getByLabel("Reason").fill(`I was present (seat 14), test ${run}`);
  await dlg.getByRole("button", { name: "Send request" }).click();
  // On success the page refreshes (the row now shows the open request, unmounting the dialog);
  // the student must still get the confirmation toast.
  check(
    "the student requests a correction",
    (await seen(student.getByText("Request sent to your instructor.").filter({ visible: true }))) &&
      (await seen(student.getByText(/Correction to \w+ requested/).filter({ visible: true }))),
  );

  // Crafted: a student can't mark attendance (their record in the new session stays as marked).
  const studentRowIdBefore = await page.goto(`${BASE}${sessionPath}`).then(() => page.content());
  const firstId = studentRowIdBefore.match(new RegExp(`id\\\\?":\\\\?"([0-9a-f-]{36})\\\\?",\\\\?"name\\\\?":\\\\?"${firstName}`))?.[1];
  await callAction(student, "saveAttendance", [{ sessionId, entries: [{ studentId: firstId, status: "present" }] }], `/student`);
  await page.reload();
  await rows.first().waitFor();
  check(
    "a student's crafted call can't change attendance",
    Boolean(firstId) && (await page.getByRole("radio", { name: `Absent for ${firstName}` }).isChecked()),
  );
  await student.context().close();

  /* ---------------------- TA can't decide; instructor can ---------------------- */
  await page.goto(`${BASE}/instructor/courses/${courseId}`);
  await page.getByRole("tab", { name: /Attendance/ }).click();
  await page.getByRole("button", { name: /Approve correction for/ }).first().waitFor();
  const correctionId = (await page.content()).match(/id\\?":\\?"([0-9a-f-]{36})\\?",\\?"student\\?":\\?"/)?.[1];
  const ta = await signIn("karan.mehra@eduwave.edu");
  await callAction(ta, "decideCorrection", [correctionId, true], "/instructor");
  await ta.goto(`${BASE}/instructor/courses/${courseId}`);
  await ta.getByRole("tab", { name: /Attendance/ }).click();
  const taSeesSheet = await seen(ta.getByRole("button", { name: "Take attendance" }));
  const taSeesDecisions = (await ta.getByRole("button", { name: /Approve correction for/ }).count()) > 0;
  await ta.context().close();
  await page.reload();
  await page.getByRole("tab", { name: /Attendance/ }).click();
  check(
    "a TA can take attendance but not decide corrections (crafted call refused)",
    Boolean(correctionId) && taSeesSheet && !taSeesDecisions && (await seen(page.getByRole("button", { name: /Approve correction for/ }))),
  );
  await page.getByRole("button", { name: /Approve correction for/ }).first().click();
  check("the instructor approves the correction", await seen(page.getByText("Correction approved.")));

  const student2 = await signIn("24CS1004");
  const notes = await (await student2.request.get(`${BASE}/api/notifications`)).json();
  check("the student is notified of the decision", notes.items.some((n) => /attendance correction approved/.test(n.title)));
  await student2.context().close();

  const csv = await page.request.get(`${BASE}/instructor/courses/${courseId}/attendance/export`);
  const text = await csv.text();
  check("attendance CSV export", csv.status() === 200 && text.includes("Attendance %") && text.includes("24CS1004"));
  await page.context().close();
} catch (err) {
  check("unexpected error", false, err.message.split("\n")[0]);
  if (page) console.log("URL at failure:", page.url());
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
