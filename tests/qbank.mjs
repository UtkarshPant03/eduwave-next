/**
 * Phase 3 (4.4): question bank, question types, random slots, open dates and multiple
 * attempts. Acceptance checks for SPEC-1 from the instructor, teaching-assistant and
 * student viewpoints (and a second department's instructor for the sharing boundary).
 * Permission boundaries are replayed as crafted Server Action calls (ids from the build
 * manifest), as in tests/attendance.mjs.
 *
 * Run against a fresh seeded database and a server started from the same build:
 *   EDUWAVE_ENV=local npm start -- -p 3100   →   npm run test:qbank
 *
 * Takes ~5 minutes: one quiz is created with a deadline a few minutes ahead so the
 * answer-key reveal after the deadline can be checked in the same run.
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
const gone = (loc, timeout = 5000) => loc.first().waitFor({ state: "detached", timeout }).then(() => true, () => false);
const pad = (n) => String(n).padStart(2, "0");
const localDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** The prompt as the bank's edit/delete buttons name it. */
const short = (p) => (p.length > 40 ? `${p.slice(0, 40)}…` : p);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
const actionId = (name) => Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
/** A crafted Server Action call with JSON arguments. Returns the status and the RSC body. */
async function callAction(page, name, args, path) {
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { "Next-Action": actionId(name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
  return { status: res.status(), text: await res.text().catch(() => "") };
}
/** A crafted call of a Server Action whose only argument is a FormData (React's "$K1" encoding). */
async function callFormAction(page, name, fields, path) {
  // Field order matters: the server resolves "$K1" when it reads the root field "0", so
  // the form's own fields must come first (as React's encodeReply sends them).
  const multipart = new FormData();
  for (const [k, v] of Object.entries(fields)) multipart.append(`_1_${k}`, v);
  multipart.append("0", '["$K1"]');
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { "Next-Action": actionId(name), Accept: "text/x-component", Origin: BASE },
    multipart,
    maxRedirects: 0,
  });
  return { status: res.status(), text: await res.text().catch(() => "") };
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
const courseIdOf = async (page, role, code) => {
  await page.goto(`${BASE}/${role}/courses`);
  const href = await page.locator(`a[href^="/${role}/courses/"]`).filter({ hasText: code }).first().getAttribute("href");
  return href.split("/")[3];
};
const notFoundUI = (page) => seen(page.getByRole("heading", { name: "Page not found" }));
/** Bank question ids from a bank page's RSC payload (the edit buttons receive the row). */
function bankRow(html, prompt) {
  const at = html.search(new RegExp(`prompt\\\\?":\\\\?"${reEsc(prompt)}`));
  if (at < 0) return null;
  const before = [...html.slice(Math.max(0, at - 600), at).matchAll(/id\\?":\\?"([0-9a-f-]{36})\\?",\\?"categoryId\\?":\\?"([0-9a-f-]{36})/g)].pop();
  return before ? { id: before[1], categoryId: before[2] } : null;
}
const rawHtml = async (page, path) => (await page.request.get(`${BASE}${path}`)).text();
const rscPayload = async (page, path) => (await page.request.get(`${BASE}${path}`, { headers: { RSC: "1" } })).text();

/* Correct answers of the seeded CS201 bank (and of the copies quizzes hold). */
const KEY = {
  "What is the worst-case time of linear search on n items?": { pick: ["O(n)"] },
  "Merge sort runs in O(n log n) time in the worst case.": { pick: ["True"] },
  "Which of these comparison sorts are O(n log n) in the worst case?": { pick: ["Merge sort", "Heap sort"] },
  "What is log₂(1024)?": { type: "10" },
  "Which data structure follows last-in, first-out (LIFO) order?": { type: "stack" },
  "Which structure gives O(1) access to the i-th element?": { pick: ["Array"] },
  "A queue removes elements in first-in, first-out (FIFO) order.": { pick: ["True"] },
  "Which operations take O(1) time on a singly linked list that only has a head pointer?": { pick: ["Insert at the head", "Delete the head"] },
  "A hash table holds 75 entries in 100 buckets. What is its load factor?": { type: "0.75" },
};
const COMPLEXITY = Object.keys(KEY).slice(0, 4);
const LINEAR = Object.keys(KEY).slice(4);

/* The quiz this suite builds: every type, mixed points, one random slot (11 points). */
const P = {
  single: `QB${run} Which traversal uses a queue?`,
  multiple: `QB${run} Which of these sorts are stable?`,
  tf: `QB${run} A binary heap is a complete binary tree.`,
  short: `QB${run} Which graph representation needs V x V space?`,
  num: `QB${run} What is e squared, to 3 decimal places?`,
};
const EXPLAIN = `EXPLAIN${run} rows and columns are vertices`;
KEY[P.single] = { pick: ["BFS"] };
KEY[P.multiple] = { pick: ["Merge sort", "Insertion sort"] };
KEY[P.tf] = { pick: ["True"] };
KEY[P.short] = { type: "  adjacency   MATRIX " }; // accepted: "Adjacency Matrix" (trim, case, spaces)
KEY[P.num] = { type: "7.3895" }; // accepted: 7.38906 ± 0.00125 (digits that no timestamp in the page can contain)

/** Reads the prompts of an in-progress attempt (one question per screen), back to question 1. */
async function attemptPrompts(page) {
  const counter = page.getByText(/^Question \d+ of \d+/).filter({ visible: true });
  await counter.first().waitFor();
  const total = Number((await counter.first().innerText()).match(/of (\d+)/)[1]);
  const prompts = [];
  for (let i = 0; i < total; i++) {
    await page.getByRole("button", { name: `Go to question ${i + 1}`, exact: false }).click();
    await page.getByText(new RegExp(`^Question ${i + 1} of`)).filter({ visible: true }).first().waitFor();
    prompts.push(await page.locator("h2.text-lg").filter({ visible: true }).first().innerText());
  }
  return prompts;
}

/** Waits until the last answer is saved (the status reads "Saved", not "Saving…"). */
async function settled(page) {
  await page.waitForTimeout(150);
  await page.getByText("Saving…").filter({ visible: true }).first().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  await page.getByText("Saved", { exact: true }).filter({ visible: true }).first().waitFor();
}

/** Answers every question of an in-progress attempt from `answers` (prompt → {pick|type}). */
async function answerAll(page, answers) {
  const prompts = await attemptPrompts(page);
  for (const [i, prompt] of prompts.entries()) {
    await page.getByRole("button", { name: new RegExp(`^Go to question ${i + 1}( |$)`) }).click();
    await page.getByText(new RegExp(`^Question ${i + 1} of`)).filter({ visible: true }).first().waitFor();
    const a = answers[prompt];
    if (!a) throw new Error(`no answer for "${prompt}"`);
    if (a.pick) {
      for (const opt of a.pick) {
        await page.locator("fieldset label").filter({ visible: true }).filter({ hasText: new RegExp(`^\\s*\\d\\s*${reEsc(opt)}\\s*$`) }).first().click();
        await settled(page);
      }
    } else {
      const box = page.getByLabel(/^Your answer/).filter({ visible: true }).first();
      await box.fill(a.type);
      await box.blur();
      await settled(page);
    }
  }
  return prompts;
}
async function submitAttempt(page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByText(/^Your score/).first().waitFor({ timeout: 15000 });
}
const LEAK_KEYS = /correctIndex(es)?\\?"?:\s*\[?\d|acceptedAnswers\\?"?:\s*\[|numericAnswer\\?"?:\s*-?\d|tolerance\\?"?:\s*\d/;

let page;
try {
  const meera = await signIn("meera.iyer@eduwave.edu");
  const cs201 = await courseIdOf(meera, "instructor", "CS201");
  const cs204 = await courseIdOf(meera, "instructor", "CS204");
  const rahul = await signIn("rahul.verma@eduwave.edu");
  const ma202 = await courseIdOf(rahul, "instructor", "MA202");
  const bank201 = `/instructor/courses/${cs201}/bank`;
  const bank204 = `/instructor/courses/${cs204}/bank`;
  page = meera;

  /* ------------------------- 12. seed: bank and quizzes ------------------------- */
  await meera.goto(`${BASE}/instructor/courses/${cs201}`);
  await meera.getByRole("link", { name: "Question bank" }).click();
  await meera.waitForURL(new RegExp(`${bank201}$`));
  check(
    "seed: CS201 has a bank of 9 questions in two categories",
    (await seen(meera.getByRole("heading", { name: "9 questions" }))) &&
      (await seen(meera.getByRole("link", { name: /^Complexity \(\d+\)$/ }))) &&
      (await seen(meera.getByRole("link", { name: /^Linear structures \(\d+\)$/ }))),
  );
  const catLinks = (await meera.getByRole("link", { name: /\(\d+\)$/ }).filter({ visible: true }).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  check(
    "the categories list shows how many questions each holds (Complexity 4, Linear structures 5)",
    catLinks.includes("Complexity (4)") && catLinks.includes("Linear structures (5)"),
    catLinks.join(", "),
  );
  const listText = await meera.locator("ul.divide-y").filter({ visible: true }).first().innerText();
  check(
    "seed: the bank has every question type",
    ["Single choice", "Multiple answer", "True / false", "Short answer", "Numerical"].every((t) => listText.includes(t)),
  );
  await meera.goto(`${BASE}/instructor/courses/${cs201}`);
  const q3href = await meera.locator('a[href^="/instructor/quizzes/"]').filter({ hasText: "Quiz 3" }).first().getAttribute("href");
  const q4href = await meera.locator('a[href^="/instructor/quizzes/"]').filter({ hasText: "Quiz 4" }).first().getAttribute("href");
  const q1href = await meera.locator('a[href^="/instructor/quizzes/"]').filter({ hasText: "Quiz 1" }).first().getAttribute("href");
  const quiz3 = q3href.split("/").pop();
  const quiz4 = q4href.split("/").pop();
  await meera.goto(BASE + q3href);
  check(
    "seed: a quiz with a random slot and 2 attempts (highest counts)",
    (await seen(meera.getByText(/Random questions: 2 from “Linear structures” \(2 pts each\)/))) &&
      (await seen(meera.getByText("2 attempts · highest attempt counts"))),
  );

  /* ------------------------------ 1. bank CRUD ------------------------------ */
  await meera.goto(BASE + bank201);
  const catForm = meera.locator("form").filter({ has: meera.getByRole("button", { name: "Create category" }) });
  const CAT = `Graphs ${run}`;
  await catForm.getByLabel("New category").fill(CAT);
  await catForm.getByRole("button", { name: "Create category" }).click();
  check("instructor creates a category", await seen(meera.getByText(`Category "${CAT}" created.`)));
  await catForm.getByLabel("New category").fill(CAT);
  await catForm.getByRole("button", { name: "Create category" }).click();
  check("a duplicate category name is refused", await seen(meera.getByText(`There is already a category called "${CAT}".`)));

  // New short-answer question with free-text tags.
  const SA = `QB${run} Which search explores a graph level by level?`;
  await meera.reload();
  await meera.getByRole("button", { name: "New question" }).click();
  let dlg = meera.locator("dialog[open]");
  await dlg.getByLabel("Category").selectOption({ label: CAT });
  await dlg.getByLabel("Tags (optional)").fill(" BFS, Graphs ,bfs ");
  await dlg.getByLabel("Question type").selectOption("short_answer");
  await dlg.getByLabel("Question", { exact: true }).fill(SA);
  await dlg.getByLabel("Accepted answer 1").fill("Breadth-first search");
  await dlg.getByRole("button", { name: "+ Add accepted answer" }).click();
  await dlg.getByLabel("Accepted answer 2").fill("BFS");
  await dlg.getByRole("button", { name: "Add to bank" }).click();
  check("instructor adds a short-answer question to the bank", await seen(meera.getByText("Question added to the bank.")));
  const saRow = meera.locator("li").filter({ hasText: SA }).filter({ visible: true });
  check(
    "tags are trimmed, lower-cased and de-duplicated; accepted answers listed for staff",
    (await seen(saRow)) &&
      (await saRow.first().innerText()).includes("bfs") &&
      (await saRow.first().innerText()).includes("graphs") &&
      (await saRow.first().innerText()).match(/\bbfs\b/gi).length === 2 && // tag + accepted answer "BFS"
      (await saRow.first().innerText()).includes("Answer: Breadth-first search | BFS"),
  );

  // Filters: tag, type, category and text search.
  await meera.goto(`${BASE}${bank201}?tag=bfs`);
  check("filter by tag", (await seen(meera.getByRole("heading", { name: "1 matching question" }))) && (await seen(meera.getByText(SA))));
  await meera.goto(`${BASE}${bank201}?type=numerical`);
  check("filter by type", await seen(meera.getByRole("heading", { name: "2 matching questions" })));
  await meera.goto(`${BASE}${bank201}?q=${encodeURIComponent("level by level")}`);
  check("text search", await seen(meera.getByRole("heading", { name: "1 matching question" })));

  // Edit: points 3.
  await meera.goto(BASE + bank201);
  await meera.getByRole("button", { name: `Edit question: ${short(SA)}` }).click();
  dlg = meera.locator("dialog[open]");
  await dlg.getByLabel("Points").fill("3");
  await dlg.getByRole("button", { name: "Save question" }).click();
  check("instructor edits a bank question (points 3)", (await seen(meera.getByText(/Question updated/))) && (await seen(meera.locator("li").filter({ hasText: SA }).filter({ hasText: "3 pts" }))));

  // Delete a question.
  const DEL = `QB${run} Temporary question to delete`;
  await meera.getByRole("button", { name: "New question" }).click();
  dlg = meera.locator("dialog[open]");
  await dlg.getByLabel("Category").selectOption({ label: CAT });
  await dlg.getByLabel("Question type").selectOption("true_false");
  await dlg.getByLabel("Statement").fill(DEL);
  await dlg.getByRole("radio", { name: "False", exact: true }).check();
  await dlg.getByRole("button", { name: "Add to bank" }).click();
  await meera.getByText(DEL).first().waitFor();
  meera.once("dialog", (d) => d.accept());
  await meera.getByRole("button", { name: `Delete question: ${short(DEL)}` }).click();
  check("instructor deletes a bank question", (await seen(meera.getByText("Question deleted."))) && (await gone(meera.getByText(DEL).filter({ visible: true }))));

  // A category that still holds questions can't be deleted (button disabled, crafted call refused).
  const html201 = await rawHtml(meera, bank201);
  const saIds = bankRow(html201, SA);
  const delCat = meera.getByRole("button", { name: `Delete category ${CAT}` });
  const crafted = await callAction(meera, "deleteCategory", [cs201, saIds?.categoryId], bank201);
  await meera.reload();
  check(
    "a category with questions can't be deleted (server refuses, category kept)",
    Boolean(saIds) && crafted.text.includes("Move or delete the questions in this category first.") &&
      (await seen(meera.getByRole("link", { name: new RegExp(`^${reEsc(CAT)} \\(\\d+\\)$`) }))),
    crafted.text.slice(-120).replace(/\s+/g, " "),
  );
  check("the delete button of a category with questions is disabled", await delCat.isDisabled());
  // Rename (browser prompt).
  meera.once("dialog", (d) => d.accept(`${CAT} renamed`));
  await meera.getByRole("button", { name: `Rename category ${CAT}` }).click();
  const renamedLink = meera.getByRole("link", { name: new RegExp(`^${reEsc(CAT)} renamed \\(\\d+\\)$`) });
  check("instructor renames a category", await seen(renamedLink));

  /* ----------------------- 1. TA can view but not change ----------------------- */
  const ta = await signIn("karan.mehra@eduwave.edu");
  await ta.goto(BASE + bank201);
  const taView =
    (await seen(ta.getByText("Read-only: only staff who manage the course can change the bank."))) &&
    (await seen(ta.getByText(SA))) &&
    (await ta.getByRole("button", { name: "New question" }).count()) === 0 &&
    (await ta.getByRole("button", { name: /^Edit question:/ }).count()) === 0 &&
    (await ta.getByRole("button", { name: "Create category" }).count()) === 0 &&
    (await ta.getByText("Shared in your department").count()) === 0;
  check("a TA sees the bank read-only (no create/edit/delete/share controls)", taView);
  const taSave = await callAction(ta, "saveBankQuestion", [{ courseId: cs201, id: saIds?.id, categoryId: saIds?.categoryId, tags: "hacked", question: { type: "short_answer", prompt: `HACKED ${run}`, acceptedAnswers: ["x"] } }], bank201);
  const taNew = await callAction(ta, "saveBankQuestion", [{ courseId: cs201, categoryId: saIds?.categoryId, tags: "", question: { type: "short_answer", prompt: `HACKED NEW ${run}`, acceptedAnswers: ["x"] } }], bank201);
  const taDel = await callAction(ta, "deleteBankQuestion", [cs201, saIds?.id], bank201);
  const taRen = await callAction(ta, "renameCategory", [cs201, saIds?.categoryId, `HACKED ${run}`], bank201);
  await meera.goto(BASE + bank201);
  check(
    "a TA's crafted create/edit/delete/rename calls change nothing",
    (await seen(meera.getByText(SA))) && (await meera.getByText(/HACKED/).count()) === 0 && (await seen(renamedLink)),
    `statuses ${taSave.status}/${taNew.status}/${taDel.status}/${taRen.status}`,
  );
  await ta.goto(`${BASE}${bank201}/shared/${cs204}`);
  check("a TA can't browse department banks (page not found)", await notFoundUI(ta));

  const stu = await signIn("24CS1006");
  await stu.goto(BASE + bank201);
  await stu.waitForURL((u) => !u.pathname.includes("/bank"), { timeout: 10000 }).catch(() => {});
  const stuUrl = stu.url();
  check("a student can't open the bank page", !stuUrl.includes("/bank") || (await notFoundUI(stu)), stuUrl);
  const stuSave = await callAction(stu, "saveBankQuestion", [{ courseId: cs201, categoryId: saIds?.categoryId, tags: "", question: { type: "short_answer", prompt: `STUDENT ${run}`, acceptedAnswers: ["x"] } }], "/student");
  await meera.reload();
  check("a student's crafted bank call changes nothing", (await meera.getByText(`STUDENT ${run}`).count()) === 0, `status ${stuSave.status}`);

  /* ------------------------ 2. sharing within a department ------------------------ */
  await meera.goto(BASE + bank204);
  const sharedCard = meera.locator("section").filter({ has: meera.getByRole("heading", { name: "Shared in your department" }) });
  const sharedText = await sharedCard.innerText().catch(() => "");
  check(
    "CS204's bank lists CS201 (same department) and no course of another department",
    sharedText.includes("CS201") && !sharedText.includes("MA202") && !sharedText.includes("HS101"),
    sharedText.replace(/\s+/g, " ").slice(0, 160),
  );
  const IMP = `Imported ${run}`;
  await meera.locator("form").filter({ has: meera.getByRole("button", { name: "Create category" }) }).getByLabel("New category").fill(IMP);
  await meera.getByRole("button", { name: "Create category" }).click();
  await meera.getByText(`Category "${IMP}" created.`).first().waitFor();
  await meera.goto(`${BASE}${bank204}/shared/${cs201}`);
  check("instructor browses CS201's bank from CS204", await seen(meera.getByRole("heading", { name: "CS201 question bank" })));
  await meera.getByRole("checkbox", { name: "Select: What is log₂(1024)?" }).check();
  await meera.getByRole("checkbox", { name: `Select: ${SA}` }).check();
  await meera.getByLabel("Copy into my category").selectOption({ label: IMP });
  await meera.getByRole("button", { name: "Copy 2 selected" }).click();
  check("instructor copies 2 questions into CS204", await seen(meera.getByText(`Copied 2 questions into "${IMP}".`)));
  await meera.goto(BASE + bank204);
  const copyRow = meera.locator("li").filter({ hasText: "What is log₂(1024)?" }).filter({ visible: true });
  check("the copies are in CS204's bank with their answer key", (await seen(copyRow)) && (await copyRow.first().innerText()).includes("Answer: 10 ± 0") && (await seen(meera.getByText(SA))));

  await meera.goto(`${BASE}${bank201}/shared/${ma202}`);
  check("another department's bank is not found (CS201 → MA202)", await notFoundUI(meera));
  await rahul.goto(`${BASE}/instructor/courses/${ma202}/bank`);
  const rahulShared = await rahul.locator("section").filter({ has: rahul.getByRole("heading", { name: "Shared in your department" }) }).innerText().catch(() => "");
  check("MA202's bank lists no CS courses", !/CS20[14]/.test(rahulShared), rahulShared.replace(/\s+/g, " ").slice(0, 160));
  await rahul.goto(`${BASE}/instructor/courses/${ma202}/bank/shared/${cs201}`);
  check("another department's bank is not found (MA202 → CS201)", await notFoundUI(rahul));
  const RCAT = `Stats ${run}`;
  await rahul.goto(`${BASE}/instructor/courses/${ma202}/bank`);
  await rahul.locator("form").filter({ has: rahul.getByRole("button", { name: "Create category" }) }).getByLabel("New category").fill(RCAT);
  await rahul.getByRole("button", { name: "Create category" }).click();
  await rahul.getByText(`Category "${RCAT}" created.`).first().waitFor();
  const rahulCat = (await rawHtml(rahul, `/instructor/courses/${ma202}/bank?q=x`)).match(new RegExp(`value=\\"([0-9a-f-]{36})\\">${reEsc(RCAT)}<`))?.[1];
  const rahulCopy = await callAction(rahul, "copyBankQuestions", [{ courseId: ma202, sourceCourseId: cs201, categoryId: rahulCat, questionIds: [saIds?.id] }], `/instructor/courses/${ma202}/bank`);
  await rahul.goto(`${BASE}/instructor/courses/${ma202}/bank?q=${encodeURIComponent("level by level")}`);
  const rahulSearch = await seen(rahul.getByRole("heading", { name: "0 matching questions" }));
  await rahul.goto(`${BASE}/instructor/courses/${ma202}/bank`);
  check(
    "a crafted copy from another department copies nothing (and search finds nothing)",
    Boolean(rahulCat) && rahulSearch && (await seen(rahul.getByRole("heading", { name: "0 questions" }))) && !rahulCopy.text.includes("Copied"),
    `status ${rahulCopy.status}`,
  );
  const rahulInto201 = await callAction(rahul, "copyBankQuestions", [{ courseId: cs201, sourceCourseId: cs204, categoryId: saIds?.categoryId, questionIds: [saIds?.id] }], "/instructor");
  check("a crafted copy into a course the user doesn't manage is refused", !rahulInto201.text.includes("Copied"), `status ${rahulInto201.status}`);

  /* ---------------- 6. random slot validation (server) and 7. open date ---------------- */
  const complexityId = bankRow(html201, "What is log₂(1024)?")?.categoryId;
  const deadlineSoon = new Date(Date.now() + 86_400_000).toISOString();
  const tooMany = await callAction(meera, "createQuiz", [{ courseId: cs201, sectionId: "", title: `Too many ${run}`, timeLimitMinutes: 5, deadline: deadlineSoon, questions: [], slots: [{ categoryId: complexityId, pickCount: 9, points: 1, position: 0 }] }], `/instructor/courses/${cs201}/quizzes/new`);
  check("validation refuses a random slot larger than its category", /can(')?t pick 9/.test(tooMany.text.replace(/\\u0027|&#x27;/g, "'")), tooMany.text.slice(0, 200).replace(/\s+/g, " "));
  const badOpen = await callAction(meera, "createQuiz", [{ courseId: cs201, sectionId: "", title: `Bad open ${run}`, timeLimitMinutes: 5, deadline: deadlineSoon, opensAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), questions: [{ type: "true_false", prompt: "x", correctIndex: 0 }] }], `/instructor/courses/${cs201}/quizzes/new`);
  check("validation refuses an opening time after the deadline", badOpen.text.includes("The quiz must open before its deadline."));

  const s4 = await signIn("24CS1008");
  await s4.goto(`${BASE}/student/quizzes/${quiz4}`);
  const opensShown = await seen(s4.getByText(/This quiz opens .+\. Come back then to start it\./));
  const noStart = (await s4.getByRole("button", { name: "Start quiz" }).count()) === 0;
  await callFormAction(s4, "startAttempt", { quizId: quiz4 }, `/student/quizzes/${quiz4}`);
  await s4.reload();
  check(
    "before the open date: the student sees when it opens, can't start (crafted start refused)",
    opensShown && noStart && (await seen(s4.getByText(/This quiz opens/))) && (await s4.getByText("Time left").count()) === 0,
  );
  await s4.context().close();
  await meera.goto(BASE + q4href);
  check("the instructor's quiz page shows the open date", await seen(meera.getByText(/opens .* · due/)));

  /* -------------- 4/5/6/8. build a quiz with every type, points and a random slot -------------- */
  await meera.goto(`${BASE}/instructor/courses/${cs201}/quizzes/new`);
  const TITLE = `QB all types ${run}`;
  // Minute precision (datetime-local), 4 minutes ahead: both attempts fit before it.
  const deadline = new Date(Math.ceil((Date.now() + 4 * 60_000) / 60_000) * 60_000);
  await meera.getByLabel("Title").fill(TITLE);
  await meera.getByLabel("Time limit (minutes)").fill("2");
  await meera.locator("input[name=deadline]").fill(localDT(deadline));
  await meera.getByLabel("Attempts allowed").fill("2");
  await meera.getByLabel("Grade that counts").selectOption({ label: "Average of attempts" });
  const lastQ = (label, exact = true) => meera.getByLabel(label, { exact }).last();
  // 1. single choice (1 point; the blank first question)
  await lastQ("Question").fill(P.single);
  await lastQ("Option 1").fill("BFS");
  await lastQ("Option 2").fill("DFS");
  await lastQ("Option 3").fill("Inorder");
  await lastQ("Option 1 is correct").check();
  // 2. multiple answer (2 points)
  await meera.getByRole("button", { name: "Add question" }).click();
  await lastQ("Question type", false).selectOption("multiple");
  await lastQ("Points").fill("2");
  await lastQ("Question").fill(P.multiple);
  for (const [k, o] of ["Merge sort", "Insertion sort", "Heap sort", "Selection sort"].entries()) await lastQ(`Option ${k + 1}`).fill(o);
  await lastQ("Option 1 is correct").check();
  await lastQ("Option 2 is correct").check();
  const allOrNothingCopy = await seen(meera.getByText(/scored all-or-nothing: no partial credit/));
  // 3. true/false (1 point)
  await meera.getByRole("button", { name: "Add question" }).click();
  await lastQ("Question type", false).selectOption("true_false");
  await lastQ("Statement").fill(P.tf);
  await meera.getByRole("radio", { name: "True", exact: true }).last().check();
  // 4. short answer (3 points, explanation)
  await meera.getByRole("button", { name: "Add question" }).click();
  await lastQ("Question type", false).selectOption("short_answer");
  await lastQ("Points").fill("3");
  await lastQ("Question").fill(P.short);
  await lastQ("Accepted answer 1").fill("Adjacency Matrix");
  await meera.getByRole("button", { name: "+ Add accepted answer" }).last().click();
  await lastQ("Accepted answer 2").fill("adj matrix");
  await lastQ("Explanation (optional)", false).fill(EXPLAIN);
  // 5. numerical (2 points, tolerance)
  await meera.getByRole("button", { name: "Add question" }).click();
  await lastQ("Question type", false).selectOption("numerical");
  await lastQ("Points").fill("2");
  await lastQ("Question").fill(P.num);
  await lastQ("Correct value").fill("7.38906");
  await lastQ("Tolerance (±)", false).fill("0.00125");
  // 6. random slot: 1 from Complexity, 2 points. First ask for too many (client check).
  const addRandom = meera.getByRole("button", { name: "Add random questions" });
  const randomEnabled = await addRandom.isEnabled();
  check("the builder offers random questions when the bank has questions", randomEnabled);
  let quizId;
  if (randomEnabled) {
    await addRandom.click();
    const catSelect = meera.getByLabel("Category").last();
    const complexityLabel = (await catSelect.locator("option").allInnerTexts()).find((t) => t.startsWith("Complexity"));
    await catSelect.selectOption({ label: complexityLabel });
    await meera.getByLabel("How many").last().fill("5");
    await meera.getByRole("button", { name: /Publish quiz/ }).click();
    check("the builder refuses N larger than the category", await seen(meera.getByText(/"Complexity" has only 4 questions/)), complexityLabel);
    await meera.getByLabel("How many").last().fill("1");
    await meera.getByLabel("Points each").last().fill("2");
    const pointsLine = await seen(meera.getByText("11 points per attempt"));
    await meera.getByRole("button", { name: "Publish quiz (6 questions)" }).click();
    const published = await meera.waitForURL(/\/instructor\/quizzes\/[0-9a-f-]{36}$/, { timeout: 15000 }).then(() => true, () => false);
    check("instructor publishes the quiz from the builder (11 points per attempt)", allOrNothingCopy && pointsLine && published);
    if (published) quizId = meera.url().split("/").pop();
  }
  if (!quizId) {
    // Fallback so the rest of the suite still runs: the same quiz through the server action.
    const q = (type, prompt, points, rest) => ({ type, prompt, points, options: [], ...rest });
    await callAction(meera, "createQuiz", [{
      courseId: cs201, sectionId: "", title: TITLE, description: "", timeLimitMinutes: 2, deadline: deadline.toISOString(), opensAt: null,
      shuffle: true, maxAttempts: 2, gradingMethod: "average",
      questions: [
        { ...q("single", P.single, 1, { options: ["BFS", "DFS", "Inorder"], correctIndex: 0 }), position: 0 },
        { ...q("multiple", P.multiple, 2, { options: ["Merge sort", "Insertion sort", "Heap sort", "Selection sort"], correctIndexes: [0, 1] }), position: 1 },
        { ...q("true_false", P.tf, 1, { options: ["True", "False"], correctIndex: 0 }), position: 2 },
        { ...q("short_answer", P.short, 3, { acceptedAnswers: ["Adjacency Matrix", "adj matrix"], explanation: EXPLAIN }), position: 3 },
        { ...q("numerical", P.num, 2, { numericAnswer: 7.38906, tolerance: 0.00125 }), position: 4 },
      ],
      slots: [{ categoryId: complexityId, pickCount: 1, points: 2, position: 5 }],
    }], `/instructor/courses/${cs201}/quizzes/new`);
    await meera.goto(`${BASE}/instructor/courses/${cs201}`);
    quizId = (await meera.locator('a[href^="/instructor/quizzes/"]').filter({ hasText: TITLE }).first().getAttribute("href")).split("/").pop();
    await meera.goto(`${BASE}/instructor/quizzes/${quizId}`);
  }
  const quizPath = `/student/quizzes/${quizId}`;
  check(
    "the quiz has every type, points and a random slot (2 attempts, average)",
    (await seen(meera.getByText(/Random questions: 1 from “Complexity” \(2 pts each\)/))) &&
      (await seen(meera.getByText("2 attempts · average of attempts counts"))),
  );

  /* ------------------------------- student: attempt 1 ------------------------------- */
  const s = await signIn("24CS1006");
  await s.goto(BASE + quizPath);
  check(
    "the student sees the attempt rules (2 attempts, average counts)",
    await seen(s.getByText("Up to 2 attempts, each with its own timer. Average of attempts counts.")),
  );
  await s.getByRole("button", { name: "Start quiz" }).click();
  await s.getByText("Time left").waitFor();
  const during = (await rawHtml(s, quizPath)) + (await rscPayload(s, quizPath)) + (await s.content());
  check(
    "9. no answer key in the page source / RSC payload during the attempt",
    !LEAK_KEYS.test(during) && !during.includes("7.38906") && !during.includes("0.00125") && !during.toLowerCase().includes("adj matrix") && !during.includes(EXPLAIN),
    (during.match(LEAK_KEYS) ?? [""])[0],
  );
  check("the multiple-answer question says it is all-or-nothing", await (async () => {
    const prompts = await attemptPrompts(s);
    await s.getByRole("button", { name: new RegExp(`^Go to question ${prompts.indexOf(P.multiple) + 1}( |$)`) }).click();
    return seen(s.getByText(/All-or-nothing: you get the points only if you pick exactly the correct options\./).filter({ visible: true }));
  })());

  // 3. While the attempt runs, the bank's copies are edited: the started attempt keeps its own key.
  const pick1 = (await attemptPrompts(s)).find((p) => COMPLEXITY.includes(p));
  const html201b = await rawHtml(meera, bank201);
  const changed = {
    "What is the worst-case time of linear search on n items?": { type: "single", options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], correctIndex: 0 },
    "Merge sort runs in O(n log n) time in the worst case.": { type: "true_false", correctIndex: 1 },
    "Which of these comparison sorts are O(n log n) in the worst case?": { type: "multiple", options: ["Merge sort", "Heap sort", "Quick sort", "Insertion sort"], correctIndexes: [2] },
    "What is log₂(1024)?": { type: "numerical", numericAnswer: 11, tolerance: 0 },
  };
  let edits = 0;
  for (const [prompt, q] of Object.entries(changed)) {
    const ids = bankRow(html201b, prompt);
    const r = await callAction(meera, "saveBankQuestion", [{ courseId: cs201, id: ids?.id, categoryId: ids?.categoryId, tags: "", question: { prompt, ...q } }], bank201);
    if (r.text.includes("Question updated")) edits++;
  }
  check("the instructor edits the answer keys of the bank questions the quiz drew from", edits === 4, `${edits}/4`);

  await answerAll(s, KEY);
  await submitAttempt(s);
  check(
    "3/4/5. attempt 1 is graded on the server from the quiz's own copy: 11 / 11",
    await seen(s.getByText("11 / 11")),
    `random pick: ${pick1}`,
  );
  const afterSubmit = (await rawHtml(s, quizPath)) + (await rscPayload(s, quizPath));
  check(
    "9. no answer key after submitting, before the deadline",
    (await seen(s.getByText("Answers and explanations will be available after the quiz deadline."))) &&
      !LEAK_KEYS.test(afterSubmit) && !afterSubmit.includes("7.38906") && !afterSubmit.includes("0.00125") && !afterSubmit.toLowerCase().includes("adj matrix") && !afterSubmit.includes(EXPLAIN),
    [(afterSubmit.match(LEAK_KEYS) ?? [""])[0], ["7.38906", "0.00125", "adj matrix", EXPLAIN].filter((x) => afterSubmit.toLowerCase().includes(x.toLowerCase())).join(",")].join(" "),
  );

  // The bank shows the new key; CS204's copy (a copy, never a link) still has the old one.
  await meera.goto(BASE + bank201);
  const bankLog = await meera.locator("li").filter({ hasText: "What is log₂(1024)?" }).filter({ visible: true }).first().innerText();
  await meera.goto(BASE + bank204);
  const copyLog = await meera.locator("li").filter({ hasText: "What is log₂(1024)?" }).filter({ visible: true }).first().innerText();
  check("2. a copied question doesn't follow later edits of the original", bankLog.includes("Answer: 11 ± 0") && copyLog.includes("Answer: 10 ± 0"));

  // 3. Questions are frozen once a student has started.
  await meera.goto(`${BASE}/instructor/quizzes/${quizId}/edit`);
  const lockShown = await seen(meera.getByText(/1 student has started this quiz, so its 6 questions\s+and the time limit are locked/));
  const relock = await callAction(meera, "updateQuiz", [{ id: quizId, sectionId: "", title: TITLE, timeLimitMinutes: 2, deadline: deadline.toISOString(), maxAttempts: 2, gradingMethod: "average", questions: [{ type: "true_false", prompt: "x", correctIndex: 0 }], slots: [] }], `/instructor/quizzes/${quizId}/edit`);
  check("questions are locked once a student started (UI and crafted update)", lockShown && relock.text.includes("Questions are locked because 1 student has started this quiz."));

  /* ------------------------------- student: attempt 2 ------------------------------- */
  await s.goto(BASE + quizPath);
  await s.getByRole("button", { name: "Start attempt 2 of 2" }).click();
  await s.getByText("Time left").waitFor();
  const clock = await s.locator("p.text-4xl").filter({ visible: true }).first().innerText();
  const [mm, ss] = clock.split(":").map(Number);
  check("8. attempt 2 has its own timer (starts again from about 2:00)", mm * 60 + ss > 100, clock);
  check("attempt 2 is labelled", await seen(s.getByText(/^Attempt 2 of 2 ·/)));
  const second = { ...KEY, [P.multiple]: { pick: ["Merge sort"] }, [P.num]: { type: "7.4" } }; // -2 (all-or-nothing) and -2 (outside tolerance)
  await answerAll(s, second);
  await submitAttempt(s);
  check(
    "4/8. attempt 2: partial multiple answer scores 0, value outside tolerance scores 0 → 7 / 11; average 9 counts",
    (await seen(s.getByText("7 / 11"))) && (await seen(s.getByText(/Counts towards your grade:\s*9 \/ 11/))),
  );
  check(
    "after the last attempt there is no way to start another",
    (await s.getByRole("button", { name: /Start attempt/ }).count()) === 0 && (await seen(s.getByText("2 of 2 used.", { exact: false }))),
  );
  await callFormAction(s, "startAttempt", { quizId }, quizPath);
  await s.reload();
  check("a crafted third start is refused", (await s.getByText("Time left").count()) === 0 && (await s.getByRole("row").filter({ hasText: /^Attempt 3/ }).count()) === 0);
  const crafted2 = await callAction(meera, "updateQuiz", [{ id: quizId, sectionId: "", title: TITLE, timeLimitMinutes: 2, deadline: deadline.toISOString(), maxAttempts: 1, gradingMethod: "average" }], `/instructor/quizzes/${quizId}/edit`);
  check("the attempt limit can't drop below attempts already made", crafted2.text.includes("already made 2 attempts"), crafted2.text.slice(-200).replace(/\s+/g, " "));

  // Positive control for the crafted FormData call: a student who may start, starts.
  const s7 = await signIn("24CS1007");
  await callFormAction(s7, "startAttempt", { quizId }, quizPath);
  await s7.goto(BASE + quizPath);
  check("(control) the crafted start call works when starting is allowed", await seen(s7.getByText("Time left")));
  await s7.context().close();

  /* -------------- 8. graded value per method: analytics, CSV, gradebook, student -------------- */
  await meera.goto(`${BASE}/instructor/quizzes/${quizId}`);
  const resultRow = meera.getByRole("row").filter({ hasText: "24CS1006" });
  check("analytics: the counted value (average 9 / 11) and both attempts", (await seen(resultRow.filter({ hasText: "9 / 11" }))) && (await seen(resultRow.filter({ hasText: "11 · 7" }))));
  const csv = await (await meera.request.get(`${BASE}/instructor/quizzes/${quizId}/export`)).text();
  const csvRow = csv.split(/\r?\n/).find((l) => l.includes("24CS1006")) ?? "";
  check("CSV: score 9 of 11, method and attempt scores", csvRow.includes('"24CS1006","Rohan Joshi","9","11","82","Average of attempts","2","11; 7"'), csvRow);
  await meera.goto(`${BASE}/instructor/courses/${cs201}`);
  await meera.getByRole("tab", { name: /Gradebook/ }).click();
  const heads = await meera.locator("table thead th").filter({ visible: true }).allInnerTexts();
  const col = heads.findIndex((h) => h.includes(TITLE));
  const gbRow = meera.locator("tbody tr").filter({ hasText: "24CS1006" }).filter({ visible: true }).first();
  const cell = col >= 0 ? (await gbRow.locator("td").nth(col).innerText()).trim() : "";
  check("gradebook: the quiz column shows the averaged 9 (out of 11)", col >= 0 && cell === "9" && heads[col].includes("/11"), `col ${col} cell "${cell}" head "${heads[col] ?? ""}"`);
  await s.goto(`${BASE}/student/courses/${cs201}`);
  await s.getByRole("tab", { name: /Grades/ }).click();
  check("the student's grades show the averaged 9 / 11", await seen(s.getByRole("row").filter({ hasText: TITLE }).filter({ hasText: "9 / 11" }).filter({ visible: true })));

  /* ------------------------- 6. random picks on the seeded quiz 3 ------------------------- */
  const picks = [];
  for (const sid of ["24CS1003", "24CS1005"]) {
    const p = await signIn(sid);
    await p.goto(`${BASE}/student/quizzes/${quiz3}`);
    await p.getByRole("button", { name: "Start quiz" }).click();
    await p.getByText("Time left").waitFor();
    const got = (await attemptPrompts(p)).filter((x) => LINEAR.includes(x));
    await p.reload();
    const again = (await attemptPrompts(p)).filter((x) => LINEAR.includes(x));
    picks.push({ got, frozen: got.join("|") === again.join("|") });
    await p.context().close();
  }
  check(
    "6. each attempt gets 2 random picks, frozen on reload",
    picks.every((p) => p.got.length === 2 && p.frozen),
    JSON.stringify(picks.map((p) => p.got)),
  );
  check("6. neighbours get different picks when the pool is large enough", picks[0].got.every((x) => !picks[1].got.includes(x)), JSON.stringify(picks.map((p) => p.got)));
  const arjun = await signIn("24CS1002");
  await arjun.goto(`${BASE}/student/quizzes/${quiz3}`);
  check("seed: a student with 1 of 2 attempts can start attempt 2", await seen(arjun.getByRole("button", { name: "Start attempt 2 of 2" })));
  await arjun.context().close();
  const ananya = await signIn("24CS1001");
  await ananya.goto(`${BASE}/student/quizzes/${quiz3}`);
  const ananyaBest = await seen(ananya.getByText(/Counts towards your grade:\s*5 \/ 5/));
  await callFormAction(ananya, "startAttempt", { quizId: quiz3 }, `/student/quizzes/${quiz3}`);
  await ananya.reload();
  check(
    "seed: 2 attempts used (1 then 5 of 5), highest counts, no third attempt",
    ananyaBest && (await ananya.getByRole("button", { name: /Start attempt/ }).count()) === 0 && (await ananya.getByText("Time left").count()) === 0,
  );
  // 10. a pre-4.4 style quiz still shows its stored score.
  await ananya.goto(`${BASE}${q1href.replace("/instructor/", "/student/")}`);
  check("10. the seeded single-choice Quiz 1 still shows the student's score and the answers", (await seen(ananya.getByText(/^\d+ \/ \d+$/))) && (await seen(ananya.getByText("Answers and explanations are shown below."))));
  await ananya.context().close();

  // 8. Once students have started, the grading method (and other details) can still change.
  await meera.goto(`${BASE}${q3href}/edit`);
  await meera.waitForFunction(() => document.querySelector("input[name=deadline]")?.value); // filled after hydration
  await meera.getByLabel("Grade that counts").selectOption({ label: "First attempt" });
  await meera.getByRole("button", { name: "Save changes" }).click();
  const saved = await meera.waitForURL(new RegExp(`${reEsc(q3href)}$`), { timeout: 15000 }).then(() => true, () => false);
  const saveError = saved ? "" : await meera.locator("form p.text-danger").filter({ visible: true }).first().innerText().catch(() => (meera.url()));
  check(
    "8. a started quiz's grading method can be changed (Quiz 3 → first attempt)",
    saved && (await seen(meera.getByText("2 attempts · first attempt counts"))),
    saveError,
  );
  const ananya2 = await signIn("24CS1001");
  await ananya2.goto(`${BASE}/student/quizzes/${quiz3}`);
  check("8. the student's counted value follows the new method (first attempt: 1 / 5)", await seen(ananya2.getByText(/Counts towards your grade:\s*1 \/ 5/)));
  await ananya2.context().close();

  /* ----------------------- 9. after the deadline the key is revealed ----------------------- */
  const wait = deadline.getTime() + 15_000 - Date.now();
  if (wait > 0) {
    console.log(`(waiting ${Math.round(wait / 1000)} s for the quiz deadline)`);
    await s.waitForTimeout(wait);
  }
  await s.goto(`${BASE}${quizPath}?attempt=2`);
  check(
    "9. after the deadline: accepted answers, value ± tolerance and explanations are shown",
    (await seen(s.getByText("Answers and explanations are shown below."))) &&
      (await seen(s.getByText("Adjacency Matrix | adj matrix"))) &&
      (await seen(s.getByText(/Correct answer:\s*7\.38906\s*\(± 0\.00125 accepted\)/))) &&
      (await seen(s.getByText(EXPLAIN))),
  );
  check(
    "attempt 2 review marks the partial multiple answer and the out-of-tolerance value incorrect",
    (await s.getByRole("img", { name: "Incorrect" }).count()) === 2 && (await s.getByRole("img", { name: "Correct", exact: true }).count()) === 4,
  );
  await s.context().close();
  await rahul.context().close();
  await ta.context().close();
  await stu.context().close();
  await meera.context().close();
} catch (err) {
  check("unexpected error", false, err.message.split("\n")[0]);
  if (page) console.log("URL at failure:", page.url());
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
