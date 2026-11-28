/**
 * Adversarial tests for 4.4.0: question bank, question types, random slots, open dates and
 * multiple attempts (SPEC-1). Every new or changed Server Action is replayed as a crafted
 * call (ids from the build manifest) by: a student, the TA, an instructor of a course in
 * another department, a department manager (HOD) of another department, and a signed-out
 * visitor. Each attack is judged by its EFFECT (what the bank / quiz / attempt looks like
 * afterwards), not by the HTTP status. Also: answer-key leaks in the page source / RSC
 * payload, server-side grading edges, parallel attempt starts and double submits.
 *
 * Run against a FRESH seeded database and a server started from the same build:
 *   rm -rf .pglite && npm run db:migrate && npm run db:seed && npm run build
 *   EDUWAVE_ENV=local npm start -- -p 3100   →   node tests/qbank-attacks.mjs
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
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
const actionId = (name) => {
  const id = Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
  if (!id) throw new Error(`action ${name} not found in manifest`);
  return id;
};
/** A Server Action called with JSON-encodable arguments. */
async function callAction(page, name, args, path = "/instructor") {
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { "Next-Action": actionId(name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
  return { status: res.status(), text: await res.text(), location: res.headers()["x-action-redirect"] ?? "" };
}
/**
 * A Server Action whose LAST argument is a FormData (form actions). React encodes it as
 * multipart fields "_1_<name>" referenced by "$K1"; the fields must precede the root "0".
 */
async function callFormAction(page, name, leading, fields, path = "/instructor") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(`_1_${k}`, v);
  fd.append("0", JSON.stringify([...leading, "$K1"]));
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { "Next-Action": actionId(name), Accept: "text/x-component", Origin: BASE },
    multipart: fd,
    maxRedirects: 0,
  });
  return { status: res.status(), text: await res.text() };
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
/** Fully streamed HTML (page source + RSC payload) of a path. */
async function html(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  return page.content();
}
/** Visible text (SSR splits text nodes with comments, so UI text is matched here). */
async function text(page, path) {
  if (path) await html(page, path);
  return page.locator("body").innerText();
}
const notFoundUi = (t) => /Page not found/.test(t);
const courseIds = async (page) => {
  await page.goto(`${BASE}/instructor/courses`);
  const links = await page.locator('a[href^="/instructor/courses/"]').evaluateAll((as) => as.map((a) => [a.textContent ?? "", a.getAttribute("href").split("/")[3]]));
  return Object.fromEntries(links.map(([t, id]) => [t.match(/[A-Z]{2}\d{3}/)?.[0], id]).filter(([c]) => c));
};
const J = '\\\\?"'; // a JSON quote inside the HTML-embedded RSC payload (optionally escaped)
/** Bank questions in a bank page's payload: [{ id, categoryId, type, prompt }]. */
const bankRows = (h) =>
  [...h.matchAll(new RegExp(`id${J}:${J}([0-9a-f-]{36})${J},${J}categoryId${J}:${J}([0-9a-f-]{36})${J},${J}category${J}:${J}[^"\\\\]*${J},${J}type${J}:${J}(\\w+)${J},${J}prompt${J}:${J}(.{0,60})`, "g"))].map((m) => ({
    id: m[1], categoryId: m[2], type: m[3], prompt: m[4],
  }));
const categories = (h) => Object.fromEntries([...h.matchAll(/category=([0-9a-f-]{36})"[^>]*>([^<(]+)/g)].map((m) => [m[2].trim(), m[1]]));
/** Questions handed to the quiz runner: [{ id, type, prompt, options }] in display order. */
const runnerQuestions = (h) => {
  const out = [];
  const re = new RegExp(`${J}id${J}:${J}([0-9a-f-]{36})${J},${J}type${J}:${J}(\\w+)${J},${J}prompt${J}:${J}(.*?)${J},${J}points${J}:(\\d+),${J}options${J}:\\[(.*?)\\]`, "g");
  for (const m of h.matchAll(re)) {
    const options = m[5] === "" ? [] : m[5].split(/\\?",\\?"/).map((o) => o.replace(/^\\?"|\\?"$/g, ""));
    if (!out.some((q) => q.id === m[1])) out.push({ id: m[1], type: m[2], prompt: m[3], points: Number(m[4]), options });
  }
  return out;
};

let meera;
try {
  /* ------------------------------- setup ------------------------------- */
  meera = await signIn("meera.iyer@eduwave.edu"); // instructor CS201 + CS204, HOD of CSE
  const rahul = await signIn("rahul.verma@eduwave.edu"); // MA202, Mathematics department
  const sara = await signIn("sara.thomas@eduwave.edu"); // HS101 coordinator, Humanities
  const ta = await signIn("karan.mehra@eduwave.edu"); // TA of CS201
  const student = await signIn("24CS1006");
  const anon = await (await browser.newContext()).newPage();
  const { CS201: cs201, CS204: cs204 } = await courseIds(meera);
  const { MA202: ma202 } = await courseIds(rahul);
  const { HS101: hs101 } = await courseIds(sara);
  check("setup: course ids found", Boolean(cs201 && cs204 && ma202 && hs101), JSON.stringify({ cs201, cs204, ma202, hs101 }));

  let bank = await html(meera, `/instructor/courses/${cs201}/bank`);
  const rows = bankRows(bank);
  const cat = categories(bank);
  const complexity = cat["Complexity"];
  const linear = cat["Linear structures"];
  const qLinear = rows.find((r) => r.prompt.startsWith("What is the worst-case time of linear search"));
  const qArray = rows.find((r) => r.prompt.startsWith("Which structure gives O(1) access"));
  check("setup: seeded CS201 bank (2 categories, 9 questions)", Boolean(complexity && linear && qLinear && qArray) && rows.length === 9, `${rows.length} rows, cats ${Object.keys(cat)}`);

  // Legit: an empty category in CS201 (attack target for deleteCategory).
  const emptyCat = `Empty-${run}`;
  await callFormAction(meera, "createCategory", [null], { courseId: cs201, name: emptyCat });
  const emptyCatId = categories(await html(meera, `/instructor/courses/${cs201}/bank`))[emptyCat];
  check("instructor creates a category (form action)", Boolean(emptyCatId));

  // Legit: CS204 bank with one unique question (same department as CS201).
  await callFormAction(meera, "createCategory", [null], { courseId: cs204, name: `DB-${run}` });
  const cat204 = categories(await html(meera, `/instructor/courses/${cs204}/bank`))[`DB-${run}`];
  const p204 = `CS204-only-${run}: which normal form removes partial dependencies?`;
  await callAction(meera, "saveBankQuestion", [{ courseId: cs204, categoryId: cat204, tags: "nf", question: { type: "single", prompt: p204, options: ["1NF", "2NF", "3NF"], correctIndex: 1 } }]);
  let b204 = await html(meera, `/instructor/courses/${cs204}/bank`);
  const q204 = bankRows(b204).find((r) => r.prompt.startsWith(`CS204-only-${run}`));
  check("instructor adds a question to another bank she manages (CS204)", Boolean(q204));

  // Legit: MA202 bank with one unique question (Mathematics department).
  await callFormAction(rahul, "createCategory", [null], { courseId: ma202, name: `Prob-${run}` });
  const catMa = categories(await html(rahul, `/instructor/courses/${ma202}/bank`))[`Prob-${run}`];
  const pMa = `MA202-only-${run}: P(A or B) for disjoint A, B?`;
  await callAction(rahul, "saveBankQuestion", [{ courseId: ma202, categoryId: catMa, tags: "", question: { type: "short_answer", prompt: pMa, acceptedAnswers: ["P(A)+P(B)"] } }]);
  let bma = await html(rahul, `/instructor/courses/${ma202}/bank`);
  const qMa = bankRows(bma).find((r) => r.prompt.startsWith(`MA202-only-${run}`));
  check("instructor of another department has his own bank", Boolean(qMa && catMa));

  /* ------------------ bank actions replayed by unauthorised actors ------------------ */
  const attackers = [
    ["student", student, cs201],
    ["TA", ta, cs201],
    ["other-dept instructor", rahul, cs201],
    ["other-dept coordinator", sara, cs201],
    ["signed out", anon, cs201],
    ["HOD of another department", meera, ma202],
    ["TA of another course", ta, ma202],
  ];
  for (const [who, page, target] of attackers) {
    const tag = `HACK-${who.replace(/\W+/g, "")}-${run}`;
    const isCs = target === cs201;
    const targetCat = isCs ? complexity : catMa;
    const targetQ = isCs ? qLinear : qMa;
    const delCat = isCs ? emptyCatId : catMa;
    const delQ = isCs ? qArray : qMa;
    await callFormAction(page, "createCategory", [null], { courseId: target, name: `${tag}-cat` });
    await callAction(page, "renameCategory", [target, targetCat, `${tag}-ren`]);
    await callAction(page, "deleteCategory", [target, delCat]);
    await callAction(page, "saveBankQuestion", [{ courseId: target, categoryId: targetCat, tags: tag, question: { type: "true_false", prompt: `${tag}-new`, correctIndex: 0 } }]);
    await callAction(page, "saveBankQuestion", [{ courseId: target, id: targetQ.id, categoryId: targetCat, tags: tag, question: { type: "true_false", prompt: `${tag}-edit`, correctIndex: 1 } }]);
    await callAction(page, "deleteBankQuestion", [target, delQ.id]);
    // Copy INTO the target from a same-department bank (CS204 -> CS201) or from CS201 (-> MA202).
    await callAction(page, "copyBankQuestions", [{ courseId: target, sourceCourseId: isCs ? cs204 : cs201, categoryId: targetCat, questionIds: isCs ? [q204.id] : [qLinear.id] }]);
    const after = await html(isCs ? meera : rahul, `/instructor/courses/${target}/bank`);
    const leftovers = [`${tag}-cat`, `${tag}-ren`, `${tag}-new`, `${tag}-edit`].filter((s) => after.includes(s));
    const stillThere = [targetQ.prompt.slice(0, 30), delQ.prompt.slice(0, 30)].every((p) => after.includes(p)) && after.includes(isCs ? emptyCat : `Prob-${run}`);
    const copied = isCs ? after.includes(`CS204-only-${run}`) : after.includes("What is the worst-case time of linear search");
    check(`bank: ${who} can't create/rename/delete/edit/copy in ${isCs ? "CS201" : "MA202"} (crafted calls)`, leftovers.length === 0 && stillThere && !copied, `leftovers=${leftovers} stillThere=${stillThere} copied=${copied}`);
  }

  /* --------------------------- department sharing --------------------------- */
  await callAction(rahul, "copyBankQuestions", [{ courseId: ma202, sourceCourseId: cs201, categoryId: catMa, questionIds: rows.map((r) => r.id) }]);
  bma = await html(rahul, `/instructor/courses/${ma202}/bank`);
  check("sharing: an instructor of another department can't copy CS201's bank", !rows.some((r) => bma.includes(r.prompt.slice(0, 40))));
  await callAction(meera, "copyBankQuestions", [{ courseId: cs201, sourceCourseId: ma202, categoryId: complexity, questionIds: [qMa.id] }]);
  bank = await html(meera, `/instructor/courses/${cs201}/bank`);
  check("sharing: the CSE HOD can't copy from a Mathematics bank", !bank.includes(`MA202-only-${run}`));
  await callAction(meera, "copyBankQuestions", [{ courseId: cs201, sourceCourseId: cs204, categoryId: complexity, questionIds: [qMa.id] }]);
  bank = await html(meera, `/instructor/courses/${cs201}/bank`);
  check("sharing: another department's question ids can't ride on a same-department source", !bank.includes(`MA202-only-${run}`));
  const sharedPages = [
    ["Meera: CS201 <- MA202 shared page", meera, `/instructor/courses/${cs201}/bank/shared/${ma202}`],
    ["Rahul: MA202 <- CS201 shared page", rahul, `/instructor/courses/${ma202}/bank/shared/${cs201}`],
    ["TA: CS201 <- CS204 shared page", ta, `/instructor/courses/${cs201}/bank/shared/${cs204}`],
    ["Meera: MA202 bank page", meera, `/instructor/courses/${ma202}/bank`],
    ["Rahul: CS201 bank page", rahul, `/instructor/courses/${cs201}/bank`],
    ["Sara: CS201 bank page", sara, `/instructor/courses/${cs201}/bank`],
  ];
  for (const [label, page, path] of sharedPages) {
    const h = await html(page, path);
    const leaked = h.includes("What is the worst-case time of linear search") || h.includes(`MA202-only-${run}`) || h.includes(`CS204-only-${run}`);
    check(`sharing: ${label} shows nothing`, !leaked && notFoundUi(await text(page)));
  }
  const legit = await html(meera, `/instructor/courses/${cs201}/bank/shared/${cs204}`);
  check("sharing: same-department browse works", legit.includes(`CS204-only-${run}`));
  await callAction(meera, "copyBankQuestions", [{ courseId: cs201, sourceCourseId: cs204, categoryId: complexity, questionIds: [q204.id] }]);
  bank = await html(meera, `/instructor/courses/${cs201}/bank`);
  const copy = bankRows(bank).find((r) => r.prompt.startsWith(`CS204-only-${run}`));
  await callAction(meera, "saveBankQuestion", [{ courseId: cs201, id: copy?.id, categoryId: complexity, tags: "", question: { type: "single", prompt: `EDITED-copy-${run}`, options: ["x", "y"], correctIndex: 0 } }]);
  b204 = await html(meera, `/instructor/courses/${cs204}/bank`);
  check("sharing: a copy is independent (editing it leaves the source alone)", Boolean(copy) && b204.includes(`CS204-only-${run}`) && !b204.includes(`EDITED-copy-${run}`));
  const taBank = await text(ta, `/instructor/courses/${cs201}/bank`);
  check("TA can view the CS201 bank read-only (no shared banks listed)", taBank.includes("Read-only") && !taBank.includes("Shared in your department"));

  /* --------------------------------- quizzes --------------------------------- */
  const quizLinks = async (page, course) => {
    await html(page, `/instructor/courses/${course}`);
    return page.locator('a[href^="/instructor/quizzes/"]').evaluateAll((as) => as.map((a) => [a.textContent ?? "", a.getAttribute("href").split("/")[3]]));
  };
  const cs201Quizzes = await quizLinks(meera, cs201);
  const q3 = cs201Quizzes.find(([t]) => t.includes("Quiz 3: Practice"))?.[1];
  const q4 = cs201Quizzes.find(([t]) => t.includes("Quiz 4: Stacks"))?.[1];
  const maQuiz = (await quizLinks(rahul, ma202))[0]?.[1];
  // createQuiz redirects on success (the response is the next page's RSC), so look the id up.
  const quizIdOf = async (title) => (await quizLinks(meera, cs201)).find(([t]) => t.includes(title))?.[1];
  check("setup: random-slot quiz, not-yet-open quiz and an MA202 quiz found", Boolean(q3 && q4 && maQuiz), `${q3} ${q4} ${maQuiz}`);
  const deadline = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const baseQuiz = (title, extra = {}) => ({
    courseId: cs201, sectionId: "", title, description: "", timeLimitMinutes: 30, deadline, opensAt: null, shuffle: false, maxAttempts: 1, gradingMethod: "highest",
    questions: [{ type: "true_false", prompt: "x", correctIndex: 0 }], slots: [], ...extra,
  });

  // Unauthorised quiz creation and edits.
  for (const [who, page, course] of [["student", student, cs201], ["TA", ta, cs201], ["other-dept instructor", rahul, cs201], ["HOD of another department", meera, ma202], ["signed out", anon, cs201]]) {
    const title = `HACKQUIZ-${who.replace(/\W+/g, "")}-${run}`;
    const isCs = course === cs201;
    const target = isCs ? q4 : maQuiz;
    const owner = isCs ? meera : rahul;
    const editBefore = await text(owner, `/instructor/quizzes/${target}/edit`);
    await callAction(page, "createQuiz", [{ ...baseQuiz(title), courseId: course }]);
    await callAction(page, "updateQuiz", [{ id: target, ...baseQuiz(`${title}-upd`), courseId: undefined, maxAttempts: 5 }]);
    const h = await html(owner, `/instructor/courses/${course}`);
    const editAfter = await text(owner, `/instructor/quizzes/${target}/edit`);
    check(`quiz: ${who} can't create a quiz or edit one (crafted)`, !h.includes(title) && !editAfter.includes(`${title}-upd`) && editAfter === editBefore);
  }
  const smuggle = await callAction(rahul, "createQuiz", [{ ...baseQuiz(`SMUGGLE-${run}`), courseId: ma202, slots: [{ categoryId: linear, pickCount: 1, points: 1, position: 1 }] }]);
  check("quiz: a random slot can't draw from another department's category", /no longer exists in this course/.test(smuggle.text), smuggle.text.slice(-160));
  const before = (await text(meera, `/instructor/courses/${cs201}/bank`)).match(/Copied into \d+ quiz\w*/g)?.join() ?? "";
  await callAction(rahul, "createQuiz", [{ ...baseQuiz(`LINK-${run}`), courseId: ma202, questions: [{ type: "single", prompt: "linked?", options: ["a", "b"], correctIndex: 0, bankQuestionId: qLinear.id }] }]);
  const afterLinks = (await text(meera, `/instructor/courses/${cs201}/bank`)).match(/Copied into \d+ quiz\w*/g)?.join() ?? "";
  check("quiz: a foreign bank question id isn't kept as provenance", before === afterLinks, `${before} -> ${afterLinks}`);

  // Validation edges (legit owner): each must be refused with a message and no redirect.
  const invalid = [
    ["slot asks for more than the category has", { slots: [{ categoryId: linear, pickCount: 6, points: 1, position: 1 }] }, /available|can't pick/],
    ["two slots on one category", { slots: [{ categoryId: linear, pickCount: 1, points: 1, position: 1 }, { categoryId: linear, pickCount: 1, points: 1, position: 2 }] }, /one random slot per category/],
    ["opens after the deadline", { opensAt: new Date(Date.parse(deadline) + 60_000).toISOString() }, /open before its deadline/],
    ["opens exactly at the deadline", { opensAt: deadline }, /open before its deadline/],
    ["11 attempts", { maxAttempts: 11 }, /At most 10/],
    ["0 attempts", { maxAttempts: 0 }, /at least 1 attempt/],
    ["0 points", { questions: [{ type: "true_false", prompt: "x", correctIndex: 0, points: 0 }] }, /at least 1/],
    ["fractional points", { questions: [{ type: "true_false", prompt: "x", correctIndex: 0, points: 1.5 }] }, /whole number/],
    ["negative tolerance", { questions: [{ type: "numerical", prompt: "x", numericAnswer: 1, tolerance: -0.1 }] }, /negative/],
    ["infinite numeric answer", { questions: [{ type: "numerical", prompt: "x", numericAnswer: "$Infinity" }] }, /number|Invalid/],
    ["NaN numeric answer", { questions: [{ type: "numerical", prompt: "x", numericAnswer: "$NaN" }] }, /number|Invalid/],
    ["multiple answer with no correct option", { questions: [{ type: "multiple", prompt: "x", options: ["a", "b"], correctIndexes: [] }] }, /at least one correct/],
    ["multiple answer index out of range", { questions: [{ type: "multiple", prompt: "x", options: ["a", "b"], correctIndexes: [0, 3] }] }, /out of range/],
    ["short answer with only blank accepted answers", { questions: [{ type: "short_answer", prompt: "x", acceptedAnswers: ["   ", ""] }] }, /accepted answer/],
    ["single choice with one option", { questions: [{ type: "single", prompt: "x", options: ["a"], correctIndex: 0 }] }, /at least 2 options/],
    ["no questions and no slots", { questions: [], slots: [] }, /at least one question/],
    ["slot on a category of another course of the same department", { slots: [{ categoryId: cat204, pickCount: 1, points: 1, position: 1 }] }, /no longer exists in this course/],
  ];
  for (const [label, extra, msg] of invalid) {
    const r = await callAction(meera, "createQuiz", [baseQuiz(`INVALID-${run}`, extra)]);
    check(`validation: refuses ${label}`, msg.test(r.text) && /"error"/.test(r.text), r.text.slice(-140).replace(/\s+/g, " "));
  }
  check("validation: none of the refused quizzes was created", !(await html(meera, `/instructor/courses/${cs201}`)).includes(`INVALID-${run}`));

  // Locks on a quiz students have started (Quiz 3: Ananya used both attempts).
  const q3edit = await html(meera, `/instructor/quizzes/${q3}/edit`);
  const iso = (field) => q3edit.match(new RegExp(`${field}${J}:${J}([0-9T:.Z-]{20,30})${J}`))?.[1] ?? null;
  const keep = {
    ...baseQuiz("Quiz 3: Practice (random questions)"), courseId: undefined, questions: undefined, slots: undefined, timeLimitMinutes: 15, shuffle: true,
    deadline: iso("deadline"), opensAt: iso("opensAt"),
  };
  // Exactly what the builder sends for a started quiz: no `questions` / `slots` keys.
  const lower = await callAction(meera, "updateQuiz", [{ id: q3, ...keep, maxAttempts: 1 }]);
  check("quiz: attempts allowed can't drop below an attempt already made", /can't be lower/.test(lower.text), lower.text.slice(-140).replace(/\s+/g, " "));
  const swap = await callAction(meera, "updateQuiz", [{ id: q3, ...keep, maxAttempts: 2, slots: [{ categoryId: complexity, pickCount: 1, points: 1, position: 1 }] }]);
  check("quiz: questions and slots of a started quiz are locked", /locked/.test(swap.text), swap.text.slice(-140).replace(/\s+/g, " "));
  check("quiz: Quiz 3 still draws from its random slot", /Linear structures/.test(await text(meera, `/instructor/quizzes/${q3}`)));
  // UI: the details of a started quiz stay editable (title, deadline, attempts).
  await meera.goto(`${BASE}/instructor/quizzes/${q3}/edit`);
  const form = meera.locator("form").filter({ has: meera.getByRole("button", { name: "Save changes" }) }).filter({ visible: true });
  await form.getByLabel("Title").fill(`Quiz 3: Practice (random questions) ${run}`);
  await form.getByRole("button", { name: "Save changes" }).click();
  await meera.waitForURL(/\/instructor\/quizzes\/[0-9a-f-]{36}$/, { timeout: 10000 }).catch(() => {});
  const uiErr = (await meera.locator("body").innerText()).match(/Add at least one question\.|Questions are locked[^\n]*/)?.[0];
  const renamed = (await text(meera, `/instructor/quizzes/${q3}`)).includes(`Quiz 3: Practice (random questions) ${run}`);
  check("UI: an instructor can still rename a quiz students have started", renamed && !uiErr, uiErr ?? "");

  /* ---------------------------- student: attempts ---------------------------- */
  await callFormAction(student, "startAttempt", [], { quizId: q4 }, `/student/quizzes/${q4}`);
  let st = await text(student, `/student/quizzes/${q4}`);
  check("open date: a crafted start before the quiz opens is refused", /This quiz opens/.test(st) && !/Time left/.test(st));
  const ananya = await signIn("24CS1001");
  await callFormAction(ananya, "startAttempt", [], { quizId: q3 }, `/student/quizzes/${q3}`);
  st = await text(ananya, `/student/quizzes/${q3}`);
  check("attempts: a crafted start after the last attempt is refused", !/Time left/.test(st) && /2 of 2 used/.test(st));
  await ananya.context().close();

  // Parallel starts: one attempt only.
  const s7 = await signIn("24CS1007");
  await Promise.all(Array.from({ length: 6 }, () => callFormAction(s7, "startAttempt", [], { quizId: q3 }, `/student/quizzes/${q3}`)));
  let sp = await html(s7, `/student/quizzes/${q3}`);
  const given = runnerQuestions(sp);
  check("concurrency: 6 parallel starts create exactly one attempt", /Attempt 1 of 2/.test(await text(s7)) && given.length === 3, `${given.length} questions given`);

  const secrets = ["acceptedAnswers", "correctIndexes", "correctIndex", "numericAnswer", "tolerance", "a stack", "Load factor = entries", "It always splits in half", "explanation"];
  const leaks = secrets.filter((s) => sp.includes(s));
  check("leak: the running attempt's page/RSC payload has no answer key", leaks.length === 0, leaks.join(", "));
  const poolPrompts = ["Which data structure follows last-in", "Which structure gives O(1) access", "A queue removes elements", "Which operations take O(1) time", "A hash table holds 75 entries"];
  const shownPool = poolPrompts.filter((p) => sp.includes(p));
  check("leak: only the 2 picked pool questions are sent (not the whole pool)", shownPool.length === 2, `${shownPool.length} pool prompts in page`);

  // A neighbour's attempt gets other picks (least-used first); one of them wasn't given to s7.
  const s10 = await signIn("24CS1010");
  await callFormAction(s10, "startAttempt", [], { quizId: q3 }, `/student/quizzes/${q3}`);
  const given10 = runnerQuestions(await html(s10, `/student/quizzes/${q3}`));
  const notGiven = given10.map((g) => g.id).find((id) => !given.some((g) => g.id === id));
  check("random picks: the next student gets different pool questions", Boolean(notGiven) && given10.length === 3, `${given10.length} questions for the neighbour`);
  await s10.context().close();

  const save = async (page, payload) => {
    const r = await callAction(page, "saveAnswer", [payload], `/student/quizzes/${payload.quizId}`);
    return /"ok":true/.test(r.text) ? "ok" : (r.text.match(/"reason":"(\w+)"/)?.[1] ?? `status ${r.status}`);
  };
  check("crafted answer to a pool question this attempt wasn't given is refused", (await save(s7, { quizId: q3, questionId: notGiven, displayIndex: 0, text: "stack", number: 0.75, displayIndexes: [0, 1] })) === "invalid");
  const tf = given.find((g) => g.type === "true_false");
  check("crafted text answer to a true/false question is refused", (await save(s7, { quizId: q3, questionId: tf.id, text: "True" })) === "invalid");
  check("crafted out-of-range option is refused", (await save(s7, { quizId: q3, questionId: tf.id, displayIndex: 2 })) === "invalid");
  check("crafted Infinity number is refused", (await save(s7, { quizId: q3, questionId: tf.id, number: "$Infinity" })) === "invalid");
  check("a 501-character text answer is refused", (await save(s7, { quizId: q3, questionId: tf.id, text: "x".repeat(501) })) === "invalid");
  check("another student can't answer into this attempt", (await save(student, { quizId: q3, questionId: tf.id, displayIndex: 0 })) === "closed");

  // Answer every given question correctly (seeded key), with formatting edges.
  const want = {
    "Merge sort runs": { one: "True" },
    "Which data structure follows last-in": { text: "  A    STACK  " }, // case, NBSP, spaces
    "Which structure gives O(1) access": { one: "Array" },
    "A queue removes elements": { one: "True" },
    "Which operations take O(1) time": { many: ["Insert at the head", "Delete the head"] },
    "A hash table holds 75 entries": { number: 0.76 }, // 0.75 ± 0.01: the boundary counts
  };
  const saved1 = [];
  for (const g of given) {
    const key = Object.entries(want).find(([p]) => g.prompt.startsWith(p))?.[1];
    if (!key) { saved1.push(`no key for ${g.prompt}`); continue; }
    const payload = { quizId: q3, questionId: g.id };
    if (key.one) payload.displayIndex = g.options.indexOf(key.one);
    if (key.many) payload.displayIndexes = key.many.map((o) => g.options.indexOf(o));
    if (key.text) payload.text = key.text;
    if (key.number != null) payload.number = key.number;
    saved1.push(await save(s7, payload));
  }
  check("answers saved for every given question", saved1.every((r) => r === "ok"), saved1.join(","));
  await Promise.all([callAction(s7, "submitAttempt", [q3], `/student/quizzes/${q3}`), callAction(s7, "submitAttempt", [q3], `/student/quizzes/${q3}`)]);
  sp = await html(s7, `/student/quizzes/${q3}`);
  st = await text(s7);
  check("grading: all-correct attempt scores 5 / 5 (short answer normalised, tolerance boundary)", /Your score \(attempt 1\)\s*5 \/ 5/.test(st), st.match(/Your score[^\n]*\n[^\n]*/)?.[0]);
  const reviewLeaks = ["Accepted answer", "Correct answer:", "Load factor = entries", "It always splits in half", "acceptedAnswers", "numericAnswer"].filter((s) => sp.includes(s));
  check("leak: reviewing a finished attempt before the deadline shows no key", reviewLeaks.length === 0, reviewLeaks.join(", "));
  check("a crafted answer after submitting is refused", (await save(s7, { quizId: q3, questionId: tf.id, displayIndex: 1 })) === "closed");

  // Attempt 2 (parallel starts again), left blank, then a third start must fail.
  await Promise.all(Array.from({ length: 4 }, () => callFormAction(s7, "startAttempt", [], { quizId: q3 }, `/student/quizzes/${q3}`)));
  const given2 = runnerQuestions(await html(s7, `/student/quizzes/${q3}`));
  check("attempt 2 starts once", /Attempt 2 of 2/.test(await text(s7)) && given2.length === 3);
  await callAction(s7, "submitAttempt", [q3], `/student/quizzes/${q3}`);
  await callFormAction(s7, "startAttempt", [], { quizId: q3 }, `/student/quizzes/${q3}`);
  st = await text(s7, `/student/quizzes/${q3}`);
  check("a third attempt is refused (max 2); the highest counts", !/Time left/.test(st) && /2 of 2 used/.test(st) && /Counts towards your grade: 5 \/ 5/.test(st), st.match(/Counts towards[^\n]*/)?.[0]);
  const gb = await (await meera.request.get(`${BASE}/instructor/courses/${cs201}/gradebook/export`)).text();
  const header = gb.split("\n")[0].split(",");
  const col = header.findIndex((h) => h.includes("Quiz 3"));
  const cell = (gb.split("\n").find((l) => l.includes("24CS1007")) ?? "").split(",")[col];
  check("gradebook: the highest attempt (5) counts for Quiz 3", cell === '"5"', `${header[col]} = ${cell}`);

  const exp = await rahul.request.get(`${BASE}/instructor/quizzes/${q3}/export`);
  check("export: another department's instructor gets no Quiz 3 CSV", exp.status() !== 200 || !(await exp.text()).includes("24CS1007"));
  const sexp = await student.request.get(`${BASE}/instructor/quizzes/${q3}/export`, { maxRedirects: 0 });
  check("export: a student gets no Quiz 3 CSV", !(await sexp.text()).includes("24CS1007"));
  const notes = JSON.stringify(await (await s7.request.get(`${BASE}/api/notifications`)).json());
  check("leak: notifications carry no answer key", !/stack|0\.75|correctIndex/i.test(notes));
  await s7.context().close();

  /* ------------------------ grading edges on fixed questions ------------------------ */
  const edge = await callAction(meera, "createQuiz", [
    baseQuiz(`EDGE-${run}`, {
      questions: [
        { type: "short_answer", prompt: "Edge: name the notation", acceptedAnswers: ["Big O", "big-oh"], points: 2 },
        { type: "numerical", prompt: "Edge: 0.1 + 0.2", numericAnswer: 0.3, tolerance: 0 },
        { type: "numerical", prompt: "Edge: about ten", numericAnswer: 10, tolerance: 0.5 },
        { type: "multiple", prompt: "Edge: pick a and c", options: ["a", "b", "c", "d"], correctIndexes: [2, 0, 2], points: 3 },
        { type: "true_false", prompt: "Edge: false statement", options: ["Yes", "No", "Maybe"], correctIndex: 1 },
        { type: "numerical", prompt: "Edge: bytes in one KiB", numericAnswer: 1024, tolerance: 0 },
      ],
    }),
  ]);
  const edgeId = await quizIdOf(`EDGE-${run}`);
  check("edge quiz created", /^[0-9a-f-]{36}$/.test(edgeId ?? ""), /"error"/.test(edge.text) ? edge.text.slice(-120) : "");
  const s8 = await signIn("24CS1008");
  await callFormAction(s8, "startAttempt", [], { quizId: edgeId }, `/student/quizzes/${edgeId}`);
  const eqs = runnerQuestions(await html(s8, `/student/quizzes/${edgeId}`));
  const by = (p) => eqs.find((q) => q.prompt.startsWith(p));
  check("true/false always shows True / False", JSON.stringify(by("Edge: false statement")?.options) === '["True","False"]', JSON.stringify(by("Edge: false statement")?.options));
  const edgeSaves = [
    await save(s8, { quizId: edgeId, questionId: by("Edge: name the notation").id, text: "\tBIG\n o " }),
    await save(s8, { quizId: edgeId, questionId: by("Edge: 0.1 + 0.2").id, number: 0.1 + 0.2 }),
    await save(s8, { quizId: edgeId, questionId: by("Edge: about ten").id, number: 10.5 }),
    await save(s8, { quizId: edgeId, questionId: by("Edge: pick a and c").id, displayIndexes: [2, 0, 0] }),
    await save(s8, { quizId: edgeId, questionId: by("Edge: false statement").id, displayIndex: 1 }),
    await save(s8, { quizId: edgeId, questionId: by("Edge: bytes in one KiB").id, number: 1024 }),
  ];
  await callAction(s8, "submitAttempt", [edgeId], `/student/quizzes/${edgeId}`);
  st = await text(s8, `/student/quizzes/${edgeId}`);
  check("grading edges: 9 / 9 (whitespace, float noise, tolerance boundary, duplicate picks)", edgeSaves.every((r) => r === "ok") && /9 \/ 9/.test(st), `${edgeSaves} ${st.match(/\d+ \/ \d+/)?.[0]}`);
  await s8.context().close();

  // UI: a student types "1,024" for 1024 (a thousands separator, common in India).
  await callAction(meera, "createQuiz", [baseQuiz(`KIB-${run}`, { questions: [{ type: "numerical", prompt: "How many bytes are in one KiB?", numericAnswer: 1024, tolerance: 0 }] })]);
  const kibId = await quizIdOf(`KIB-${run}`);
  const s9 = await signIn("24CS1009");
  await s9.goto(`${BASE}/student/quizzes/${kibId}`);
  await s9.getByRole("button", { name: "Start quiz" }).click();
  const input = s9.getByLabel("Your answer (a number)");
  await input.fill("1,024");
  await input.blur();
  await s9.getByText("Saved").first().waitFor().catch(() => {});
  const refused = await s9.getByText(/Enter a number/).count();
  await s9.getByRole("button", { name: "Submit" }).click();
  await s9.getByText(/Your score/).first().waitFor({ timeout: 15000 }).catch(() => {});
  const kibPage = await text(s9);
  check('numerical: "1,024" is refused or read as 1024, never silently as 1.024', refused > 0 || /1 \/ 1/.test(kibPage), `score ${kibPage.match(/\d+ \/ \d+/)?.[0]}; ${kibPage.match(/Your answer:[^\n]*/)?.[0]}`);
  await s9.context().close();

  // A random-slot quiz nobody started can be deleted (cascades through its slots).
  await callAction(meera, "createQuiz", [baseQuiz(`DELSLOT-${run}`, { questions: [], slots: [{ categoryId: complexity, pickCount: 2, points: 1, position: 0 }] })]);
  const delId = await quizIdOf(`DELSLOT-${run}`);
  const delRes = await callAction(meera, "deleteActivity", [cs201, "quiz", delId]);
  check("a random-slot quiz nobody started can be deleted", Boolean(delId) && !(await html(meera, `/instructor/courses/${cs201}`)).includes(`DELSLOT-${run}`), delRes.text.slice(-120));
} catch (err) {
  check("unexpected error", false, err.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
