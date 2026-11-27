/**
 * Stability checks: the things that protect real data and real users once the platform
 * is in use. Complements tests/e2e.mjs (run that first or after; both use the seed data).
 *
 *  - malformed ids in URLs give a clean 404 (not a 500 error page)
 *  - AI features are hidden while no AI server is configured
 *  - graded work can't be deleted; editing keeps grades valid; quiz locks after attempts
 *  - deadline changes notify students in-app AND by email (via a local fake SMTP server)
 *  - the quiz timer auto-submits at zero, and an abandoned attempt is closed by the server
 *
 * Takes about two minutes (it waits for a real one-minute quiz timer to run out).
 *
 *   rm -rf .pglite && npm run db:migrate && npm run db:seed
 *   npm run build
 *   SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=test SMTP_PASS=test npm start -- -p 3100
 *   npm run test:stability          (second terminal; it starts the fake SMTP server itself)
 */
import { chromium } from "playwright-core";
import { startSmtpCatcher } from "./smtp-catcher.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = "eduwave2026";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const seen = (loc, timeout = 10000) => loc.first().waitFor({ timeout }).then(() => true, () => false);
const pad = (n) => String(n).padStart(2, "0");
const localDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catcher = await startSmtpCatcher(Number(process.env.SMTP_CATCHER_PORT ?? 2525));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const run = Date.now().toString().slice(-5);

async function signedIn(identifier, home) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email or student ID").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}${home}`);
  return page;
}
/** href of the first course-outline link whose text matches (sections may be collapsed). */
const hrefOf = (page, prefix, text) => page.locator(`a[href^="${prefix}"]`).filter({ hasText: text }).first().getAttribute("href");
/**
 * Streamed pages keep their 200 status when notFound() runs (documented Next.js behaviour),
 * so check for what users and search engines get: the not-found page plus a noindex tag.
 */
const isNotFoundPage = async (page) =>
  (await seen(page.getByText("Page not found"))) && (await page.locator('meta[name="robots"][content*="noindex"]').count()) > 0;

let page;
try {
  /* -------------------------- instructor: robustness -------------------------- */
  page = await signedIn("meera.iyer@eduwave.edu", "/instructor");
  const bad = await page.goto(`${BASE}/instructor/courses/not-a-real-id`);
  check("malformed course id → not-found page (not a 500)", bad.status() !== 500 && (await isNotFoundPage(page)), `status ${bad.status()}`);
  const badExport = await page.request.get(`${BASE}/instructor/quizzes/xyz/export`);
  check("malformed id in export route → 404", badExport.status() === 404, `status ${badExport.status()}`);

  await page.goto(`${BASE}/instructor/courses`);
  await page.getByText("Data Structures and Algorithms").first().click();
  await page.waitForURL(/\/instructor\/courses\/[0-9a-f-]{36}/);
  const courseUrl = page.url().split("#")[0];

  // Graded work is protected from deletion (server-side rule).
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Lab 2: Singly linked list" }).filter({ visible: true }).click();
  const refused = await seen(page.getByText(/can't be deleted: that would erase their grades/));
  await page.reload();
  check("assignment with submissions can't be deleted", refused && (await seen(page.getByText("Lab 2: Singly linked list"))));

  // Editing: maximum points can't drop below an awarded grade.
  const lab2 = await hrefOf(page, "/instructor/assignments/", "Lab 2: Singly linked list");
  const lab5 = await hrefOf(page, "/instructor/assignments/", "Lab 5: Hash table");
  const quiz1 = await hrefOf(page, "/instructor/quizzes/", "Quiz 1: Complexity analysis");
  await page.goto(`${BASE}${lab2}/edit`);
  await page.getByLabel("Maximum points").evaluate((el) => el.removeAttribute("min"));
  await page.getByLabel("Maximum points").fill("1");
  await page.getByRole("button", { name: "Save changes" }).click();
  check("edit rejects a maximum below an awarded grade", await seen(page.getByText(/already has \d+ points/)));

  // Editing: extend a deadline (students are notified).
  await page.goto(`${BASE}${lab5}/edit`);
  await page.waitForFunction(() => document.querySelector("input[name=dueAt]")?.value !== "");
  const prefilled = await page.locator("input[name=dueAt]").inputValue();
  const newDue = new Date(Date.now() + 9 * 86_400_000);
  await page.locator("input[name=dueAt]").fill(localDT(newDue));
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`${BASE}${lab5}`, { timeout: 15000 });
  // Re-open the form: the saved value must round-trip exactly (browser zone → UTC → browser zone).
  await page.goto(`${BASE}${lab5}/edit`);
  await page.waitForFunction(() => document.querySelector("input[name=dueAt]")?.value !== "");
  const saved = await page.locator("input[name=dueAt]").inputValue();
  check("instructor extends an assignment deadline", /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(prefilled) && saved === localDT(newDue), `was ${prefilled}, now ${saved}`);

  // Quiz with attempts and a passed deadline: questions, time limit and deadline locked.
  await page.goto(`${BASE}${quiz1}/edit`);
  check(
    "quiz with attempts: questions locked, past deadline fixed",
    (await seen(page.getByText(/started this quiz, so its \d+ questions/))) &&
      (await page.getByLabel("Time limit (minutes)").isDisabled()) &&
      (await page.locator("input[name=deadline]").isDisabled()),
  );

  // A 1-minute quiz for the timer test; edit its question before anyone starts.
  await page.goto(`${courseUrl}/quizzes/new`);
  await page.getByLabel("Title").fill(`Timer ${run}`);
  await page.getByLabel("Time limit (minutes)").fill("1");
  await page.locator("input[name=deadline]").fill(localDT(new Date(Date.now() + 86_400_000)));
  await page.locator("form textarea").nth(0).fill("3 + 3 = ?");
  await page.getByPlaceholder("Option 1").first().fill("6");
  await page.getByPlaceholder("Option 2").first().fill("7");
  await page.getByLabel("Option 1 is correct").first().check();
  await page.getByRole("button", { name: /Publish quiz/ }).click();
  await page.waitForURL(/\/instructor\/quizzes\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const timerQuiz = new URL(page.url()).pathname;
  const timerQuizId = timerQuiz.split("/").pop();
  await page.goto(`${BASE}${timerQuiz}/edit`);
  await page.locator("form textarea").nth(0).fill("Edited: 3 + 3 = ?");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`${BASE}${timerQuiz}`, { timeout: 15000 });
  check("quiz questions editable before anyone starts", await seen(page.getByText("Edited: 3 + 3 = ?")));
  await page.context().close();

  /* ------------------------------ students ------------------------------ */
  page = await signedIn("24CS1001", "/student");
  check("AI tutor hidden from navigation when AI is off", (await page.getByRole("link", { name: "AI tutor" }).count()) === 0);
  await page.goto(`${BASE}/student/tutor`);
  check("AI tutor page is not found when AI is off", await isNotFoundPage(page));
  const badQuiz = await page.goto(`${BASE}/student/quizzes/123`);
  check("malformed quiz id (student) → not-found page", badQuiz.status() !== 500 && (await isNotFoundPage(page)), `status ${badQuiz.status()}`);
  const notes = await (await page.request.get(`${BASE}/api/notifications`)).json();
  check("students notified in-app of the deadline change", notes.items.some((n) => /deadline changed/.test(n.title)));

  // Student A starts the 1-minute quiz and just waits.
  await page.goto(`${BASE}/student/quizzes/${timerQuizId}`);
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByText("Time left").waitFor();
  const startedA = Date.now();

  // Student B starts it and closes the browser (abandoned attempt).
  const pageB = await signedIn("24CS1002", "/student");
  await pageB.goto(`${BASE}/student/quizzes/${timerQuizId}`);
  await pageB.getByRole("button", { name: "Start quiz" }).click();
  await pageB.getByText("Time left").waitFor();
  const startedB = Date.now();
  await pageB.context().close();

  check("timer auto-submits at zero", await seen(page.getByText("Your score"), 90_000), `${Math.round((Date.now() - startedA) / 1000)}s after start`);
  await sleep(Math.max(0, startedB + 75_000 - Date.now())); // 1 min limit + 10 s grace + margin
  const pageB2 = await signedIn("24CS1002", "/student");
  await pageB2.goto(`${BASE}/student/quizzes/${timerQuizId}`);
  check("abandoned attempt is closed and graded by the server", await seen(pageB2.getByText("Your score")));
  await pageB2.context().close();
  await page.context().close();

  page = await signedIn("meera.iyer@eduwave.edu", "/instructor");
  await page.goto(`${BASE}${timerQuiz}/edit`);
  check("quiz locks once students have started", await seen(page.getByText(/2 students have started this quiz/)));
  await page.context().close();

  /* -------------------------------- email -------------------------------- */
  const deadline = Date.now() + 10_000; // emails are sent after the response (after())
  while (!catcher.messages.some((m) => /deadline changed/.test(m.data)) && Date.now() < deadline) await sleep(500);
  const mail = catcher.messages.find((m) => /deadline changed/.test(m.data));
  check(
    "deadline change emailed (BCC, plain text)",
    Boolean(mail) && mail.to.length > 1 && !/^To:.*@/m.test(mail.data) && !/Content-Type: text\/html/i.test(mail.data),
    mail ? `${mail.to.length} recipients` : "no email received: start the server with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=test SMTP_PASS=test",
  );
} catch (err) {
  check("unexpected error", false, err.message.split("\n")[0]);
  if (page) console.log("URL at failure:", page.url());
} finally {
  await browser.close();
  await catcher.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
