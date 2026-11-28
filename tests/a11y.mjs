/**
 * Automated accessibility scan with axe-core (the engine behind most a11y browser
 * extensions) over every main page, for all three roles, in light AND dark theme.
 * Checks WCAG 2.1 A/AA rules: colour contrast, labels, names, landmarks, ARIA, etc.
 *
 * Fails on "serious" or "critical" findings; "moderate"/"minor" ones are listed only.
 * Automated tools find roughly a third of accessibility problems: also test with a
 * keyboard only, and with a screen reader (NVDA is free on Windows).
 *
 *   npm run build && npm start -- -p 3100     (seeded database)
 *   npm run test:a11y
 */
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const FAIL_ON = new Set(["serious", "critical"]);

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const findings = new Map(); // rule id → { impact, help, pages: Set, samples: Map }

async function context(theme) {
  // Reduced motion: entrance animations would otherwise be caught mid-fade (false contrast errors).
  return browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
}
async function signIn(page, id) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email or student ID").fill(id);
  await page.getByLabel("Password", { exact: true }).fill("eduwave2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function scan(page, path, theme, tab) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  // Inactive tab panels aren't rendered visibly, so tabs with their own content are opened first.
  if (tab) await page.getByRole("tab", { name: new RegExp(tab) }).click();
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(() =>
    axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
  );
  for (const v of result.violations) {
    const f = findings.get(v.id) ?? { impact: v.impact, help: v.help, pages: new Set(), samples: new Map() };
    f.pages.add(`${path}${tab ? ` [${tab}]` : ""} (${theme})`);
    // Keep each distinct problem once (e.g. each colour pair), so one rule can't hide several causes.
    for (const n of v.nodes) {
      const why = (n.failureSummary ?? "").split("\n")[1]?.trim() ?? "";
      const key = why.replace(/contrast of [\d.]+|font size: [^,]+,|font weight: \w+/g, "") || n.target.join(" ");
      if (!f.samples.has(key)) f.samples.set(key, `${n.target.join(" ")}  →  ${why}  [${path} ${theme}]`);
    }
    findings.set(v.id, f);
  }
  return result.violations.length;
}
/** First link in the page whose href starts with prefix and whose text matches. */
const hrefOf = (page, prefix, text) => page.locator(`a[href^="${prefix}"]`).filter({ hasText: text }).first().getAttribute("href");

for (const theme of ["light", "dark"]) {
  const pub = await (await context(theme)).newPage();
  for (const p of ["/", "/login"]) await scan(pub, p, theme);
  await pub.context().close();

  const admin = await (await context(theme)).newPage();
  await signIn(admin, "admin@eduwave.edu");
  await admin.goto(`${BASE}/admin/courses`);
  const adminCourse = await hrefOf(admin, "/admin/courses/", "CS201");
  for (const p of ["/admin", "/admin/users", "/admin/courses", adminCourse, "/admin/structure", "/admin/audit", "/admin/account"]) await scan(admin, p, theme);
  await admin.context().close();

  const ins = await (await context(theme)).newPage();
  await signIn(ins, "meera.iyer@eduwave.edu");
  await ins.goto(`${BASE}/instructor`);
  const deptPage = await hrefOf(ins, "/instructor/department/", "Computer Science"); // Meera is HOD (seed)
  await ins.goto(`${BASE}/instructor/courses`);
  const course = await hrefOf(ins, "/instructor/courses/", "Data Structures");
  await ins.goto(BASE + course);
  const lab2 = await hrefOf(ins, "/instructor/assignments/", "Lab 2");
  const quiz1 = await hrefOf(ins, "/instructor/quizzes/", "Quiz 1");
  for (const p of [
    "/instructor", "/instructor/courses", course, `${course}/assignments/new`, `${course}/quizzes/new`, lab2, `${lab2}/edit`,
    quiz1, `${quiz1}/edit`, deptPage, "/instructor/calendar", "/instructor/boards", "/instructor/account", "/instructor/courses/not-a-course",
  ]) await scan(ins, p, theme);
  await scan(ins, course, theme, "Attendance");
  const sheet = await ins.locator('a[href*="/attendance/"]:not([href$="/export"])').first().getAttribute("href");
  await scan(ins, sheet, theme);
  // Question bank (4.4): own bank, a department colleague's bank, a filtered view, and the
  // analytics of the seeded random-slot quiz with two attempts.
  const otherCourse = await (async () => { await ins.goto(`${BASE}/instructor/courses`); return hrefOf(ins, "/instructor/courses/", "Database"); })();
  await ins.goto(BASE + course);
  const quiz3 = await hrefOf(ins, "/instructor/quizzes/", "Quiz 3");
  for (const p of [`${course}/bank`, `${course}/bank?type=multiple`, `${course}/bank/shared/${otherCourse.split("/").pop()}`, quiz3, `${quiz3}/edit`]) await scan(ins, p, theme);
  await ins.context().close();

  const stu = await (await context(theme)).newPage();
  await signIn(stu, "24CS1001");
  await stu.goto(`${BASE}/student/courses`);
  const sCourse = await hrefOf(stu, "/student/courses/", "Data Structures");
  await stu.goto(BASE + sCourse);
  const sLab = await hrefOf(stu, "/student/assignments/", "Lab 5");
  const sQuiz = await hrefOf(stu, "/student/quizzes/", "Quiz 1");
  for (const p of [
    "/student", "/student/courses", sCourse, sLab, sQuiz, "/student/catalog", "/student/grades",
    "/student/calendar", "/student/boards", "/student/account",
  ]) await scan(stu, p, theme);
  await scan(stu, sCourse, theme, "Attendance");
  // 4.4: a quiz with two finished attempts (attempts table, counted value) and one that opens later.
  await stu.goto(BASE + sCourse);
  const sQuiz3 = await hrefOf(stu, "/student/quizzes/", "Quiz 3");
  const sQuiz4 = await hrefOf(stu, "/student/quizzes/", "Quiz 4");
  for (const p of [sQuiz3, `${sQuiz3}?attempt=1`, sQuiz4]) await scan(stu, p, theme);
  await stu.context().close();
}
await browser.close();

let blocking = 0;
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [id, f] of [...findings].sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
  const fail = FAIL_ON.has(f.impact);
  if (fail) blocking++;
  console.log(`${fail ? "FAIL" : "note"}  [${f.impact}] ${id}: ${f.help}`);
  for (const sample of [...f.samples.values()].slice(0, 15)) console.log(`      - ${sample}`);
  console.log(`      on ${f.pages.size} page(s): ${[...f.pages].slice(0, 4).join(", ")}${f.pages.size > 4 ? ", …" : ""}`);
}
console.log(findings.size ? `\n${blocking} blocking rule(s), ${findings.size - blocking} advisory` : "\nNo WCAG 2.1 A/AA violations found.");
process.exit(blocking ? 1 : 0);
