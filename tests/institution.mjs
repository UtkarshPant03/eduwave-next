/**
 * Phase 2: institutional structure, course staff and scoped permissions.
 *
 * - An administrator builds department → programme → session/term → batch → section,
 *   places students, creates a course linked to them, links the section and enrols it.
 * - Course staff: adding a teaching assistant; the primary instructor can't be removed.
 * - Permission boundaries, including crafted Server Action calls (ids from the build's
 *   manifest, as in tests/security.mjs): a TA can view and grade but not change the
 *   course; instructors and students can't call admin actions.
 *
 * Run against a fresh seeded database and a server started from the same build:
 *   EDUWAVE_ENV=local npm start -- -p 3100   →   npm run test:institution
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
/** The create form inside a card, identified by its submit button (cards also hold per-row edit forms). */
const formWith = (card, button) => card.locator("form").filter({ has: card.page().getByRole("button", { name: button }) });
/** Submits the ActionForm inside the card titled `title` and waits for its toast/message. */
async function submitIn(page, cardTitle, fill, button, expect) {
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: cardTitle, exact: true }) });
  await fill(card);
  await card.getByRole("button", { name: button }).click();
  return seen(page.getByText(expect));
}

let page;
try {
  /* ------------------------------- admin builds structure ------------------------------- */
  page = await signIn("admin@eduwave.edu");
  await page.goto(`${BASE}/admin/structure`);
  const dept = `E2E Department ${run}`;
  check("admin adds a department", await submitIn(page, "Departments", async (c) => formWith(c, "Add department").getByLabel("Name").fill(dept), "Add department", `Department "${dept}" added.`));
  check(
    "admin adds a programme",
    await submitIn(page, "Programmes", async (c) => {
      const f = formWith(c, "Add programme");
      await f.getByLabel("Department").selectOption({ label: dept });
      await f.getByLabel("Name").fill(`B.Tech E2E ${run}`);
      await f.getByLabel("Semesters").fill("8");
    }, "Add programme", `Programme "B.Tech E2E ${run}" added.`),
  );
  const sessionName = `S${run}`;
  check(
    "admin adds an academic session and a term",
    (await submitIn(page, "Academic sessions and terms", async (c) => {
      const f = formWith(c, "Add session");
      await f.getByLabel("Session name").fill(sessionName);
      await f.getByLabel("Starts").fill("2030-07-01");
      await f.getByLabel("Ends").fill("2031-06-30");
    }, "Add session", `Session "${sessionName}" added.`)) &&
      (await submitIn(page, "Academic sessions and terms", async (c) => {
        const f = formWith(c, "Add term");
        await f.getByLabel("Session").selectOption({ label: sessionName });
        await f.getByLabel("Term name").fill("Odd semester");
        await f.getByLabel("Starts").fill("2030-07-15");
        await f.getByLabel("Ends").fill("2030-12-20");
      }, "Add term", `Term "Odd semester" added.`)),
  );
  check(
    "admin adds a batch and a class section",
    (await submitIn(page, "Batches and class sections", async (c) => {
      const f = formWith(c, "Add batch");
      await f.getByLabel("Programme").selectOption({ label: `B.Tech E2E ${run}` });
      await f.getByLabel("Intake year").fill("2030");
      await f.getByLabel("Batch name").fill(`Batch ${run}`);
    }, "Add batch", `Batch "Batch ${run}" added.`)) &&
      (await submitIn(page, "Batches and class sections", async (c) => {
        const f = formWith(c, "Add section");
        await f.getByLabel("Batch").selectOption({ label: `Batch ${run}` });
        await f.getByLabel("Section name").fill("A");
      }, "Add section", `Section "A" added.`)),
  );
  const termLabel = `${sessionName} · Odd semester`;
  const sectionLabel = `Batch ${run} – A`;
  check(
    "admin places students in the section for the term",
    await submitIn(page, "Place students in a section", async (c) => {
      await c.getByLabel("Term").selectOption({ label: termLabel });
      await c.getByLabel("Section").selectOption({ label: sectionLabel });
      await c.getByLabel("Students").fill("24CS1011\n24CS1012\nNOT-A-STUDENT");
    }, "Place students", /2 student\(s\) placed\. Not found: NOT-A-STUDENT/),
  );

  /* ----------------------- course linked to the structure ----------------------- */
  const CODE = `ST${run.slice(-3)}`;
  await page.goto(`${BASE}/admin/courses`);
  await page.getByLabel("Code").fill(CODE);
  await page.getByLabel("Title").fill(`Structured course ${run}`);
  await page.locator("select[name=departmentId]").selectOption({ label: dept });
  await page.locator("select[name=termId]").selectOption({ label: termLabel });
  await page.getByLabel("Instructor").selectOption({ label: "Dr. Meera Iyer" });
  await page.getByRole("button", { name: "Create course" }).click();
  await page.getByRole("link", { name: CODE }).click();
  await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}$/);
  const courseId = page.url().split("/").pop();
  check("course detail shows its department and term", await seen(page.getByText(`${dept} · ${termLabel}`)));
  await submitIn(page, "Class sections", async (c) => c.getByLabel("Section").selectOption({ label: sectionLabel }), "Link section", "Section linked.");
  await page.getByRole("button", { name: /Enrol students of linked sections/ }).click();
  check("enrolling linked sections enrols exactly the placed students", await seen(page.getByText("2 student(s) enrolled.")));

  // Staff: add a teaching assistant; the primary instructor can't be removed.
  await submitIn(page, "Course staff", async (c) => {
    await c.getByLabel("Instructor's email").fill("karan.mehra@eduwave.edu");
    await c.getByLabel("Role").selectOption("teaching_assistant");
  }, "Add to staff", "Karan Mehra added as teaching assistant.");
  check("admin adds a teaching assistant to the course", await seen(page.getByRole("cell", { name: "Teaching assistant" })));
  const meeraRow = await page.getByRole("row").filter({ hasText: "Dr. Meera Iyer" }).count();
  check("the primary instructor has no remove button", meeraRow === 1 && (await page.getByRole("button", { name: "Remove Dr. Meera Iyer from the course staff" }).count()) === 0);

  const student = await signIn("24CS1011");
  await student.goto(`${BASE}/student/courses`);
  check("a placed student sees the course after section enrolment", await seen(student.getByText(`Structured course ${run}`)));

  // A student and an instructor can't call admin actions.
  await callAction(student, "enrolLinkedSections", [courseId], "/student");
  await callAction(student, "unlinkCourseSection", [courseId, "00000000-0000-0000-0000-000000000000"], "/student");
  await student.context().close();
  const meera = await signIn("meera.iyer@eduwave.edu");
  const unlinkButtons = () => page.getByRole("button", { name: /Unlink section/ });
  await page.goto(`${BASE}/admin/courses/${courseId}`);
  await unlinkButtons().first().waitFor(); // the table streams in after the shell
  const sectionsBefore = await unlinkButtons().count();
  // Props are embedded JSON-escaped in the page, hence the optional backslashes.
  const linkedSectionId = (await page.content()).match(/sectionId\\?":\\?"([0-9a-f-]{36})/)?.[1] ?? "00000000-0000-0000-0000-000000000000";
  await callAction(meera, "unlinkCourseSection", [courseId, linkedSectionId], "/instructor");
  await page.reload();
  await unlinkButtons().first().waitFor({ timeout: 10000 }).catch(() => {});
  const sectionsAfter = await unlinkButtons().count();
  check(
    "an instructor can't call admin actions (section stays linked)",
    sectionsBefore === 1 && sectionsAfter === 1 && !linkedSectionId.startsWith("00000000"),
    `${sectionsBefore} → ${sectionsAfter}`,
  );
  await meera.context().close();
  await page.context().close();

  /* --------------------------- teaching assistant --------------------------- */
  const ta = await signIn("karan.mehra@eduwave.edu");
  await ta.goto(`${BASE}/instructor/courses`);
  await ta.getByText("Data Structures and Algorithms").first().click();
  await ta.waitForURL(/\/instructor\/courses\/[0-9a-f-]{36}/);
  const cs201 = new URL(ta.url()).pathname;
  const cs201Id = cs201.split("/").pop();
  check(
    "a TA can open the course but sees no settings or authoring controls",
    (await seen(ta.getByRole("heading", { name: "Data Structures and Algorithms" }))) &&
      (await ta.getByRole("tab", { name: /Settings/ }).count()) === 0 &&
      (await ta.getByRole("link", { name: /New assignment/ }).count()) === 0,
  );
  const lab4 = await ta.locator('a[href^="/instructor/assignments/"]').filter({ hasText: "Lab 4" }).first().getAttribute("href");
  await ta.goto(`${BASE}${lab4}`);
  check("a TA can open the grading page", await seen(ta.getByRole("button", { name: /Save grade/ })));
  // Crafted calls: a TA can't rename or delete sections (needs course.manage). The real
  // section ids come from the instructor's page (the TA's UI doesn't expose them).
  const owner = await signIn("meera.iyer@eduwave.edu");
  await owner.goto(`${BASE}${cs201}`);
  await owner.locator("details summary h3").first().waitFor();
  const sectionIds = [...new Set([...(await owner.content()).matchAll(/sectionId\\?":\\?"([0-9a-f-]{36})/g)].map((m) => m[1]))];
  const titles = () => owner.locator("details summary h3").allInnerTexts();
  const before = await titles();
  for (const id of sectionIds) {
    await callAction(ta, "updateSection", [cs201Id, id, `HACKED ${run}`, ""], cs201);
    await callAction(ta, "deleteSection", [cs201Id, id], cs201);
    await callAction(ta, "moveSection", [cs201Id, id, 1], cs201);
  }
  await owner.reload();
  await owner.locator("details summary h3").first().waitFor();
  const after = await titles();
  check(
    "a TA's crafted calls can't rename, move or delete sections",
    sectionIds.length >= 6 && JSON.stringify(before) === JSON.stringify(after),
    `${sectionIds.length} ids tried; ${before.length} → ${after.length} sections`,
  );
  await owner.context().close();
  await ta.context().close();

  /* ---------------- Phase 2b: department managers and coordinators ---------------- */
  // Ids embedded (JSON-escaped) in pages: "…userId\":\"<uuid>\",\"name\":\"Karan Mehra…".
  const idNear = (html, key, name) =>
    html.match(new RegExp(`${key}\\\\?":\\\\?"([0-9a-f-]{36})\\\\?",\\\\?"name\\\\?":\\\\?"${name}`))?.[1];
  const admin = await signIn("admin@eduwave.edu");
  await admin.goto(`${BASE}/admin/structure`);
  check(
    "admin assigns a department administrator",
    await submitIn(admin, "Department roles", async (c) => {
      const f = formWith(c, "Assign role");
      await f.getByLabel("Staff member's email").fill("rahul.verma@eduwave.edu");
      await f.getByLabel("Department role").selectOption("department_admin");
      await f.getByLabel("In department").selectOption({ label: dept });
    }, "Assign role", "Dr. Rahul Verma is now department admin."),
  );
  // Real ids for the crafted calls below, read from the admin's CS201 page.
  await admin.goto(`${BASE}/admin/courses/${cs201Id}`);
  await admin.getByRole("button", { name: /Unlink section/ }).first().waitFor();
  const cs201Html = await admin.content();
  const cs201SectionId = cs201Html.match(/sectionId\\?":\\?"([0-9a-f-]{36})/)?.[1];
  const karanId = idNear(cs201Html, "userId", "Karan Mehra");
  const cs201Links = await admin.getByRole("button", { name: /Unlink section/ }).count();

  const rahul = await signIn("rahul.verma@eduwave.edu");
  await rahul.getByRole("link", { name: new RegExp(dept) }).click();
  await rahul.waitForURL(/\/instructor\/department\/[0-9a-f-]{36}$/);
  check(
    "a department admin reaches their department from the dashboard and sees its courses",
    (await seen(rahul.getByRole("heading", { name: dept }))) && (await seen(rahul.getByRole("link", { name: CODE }))),
  );
  check(
    "a department admin adds a programme to their own department",
    await submitIn(rahul, "Programmes", async (c) => {
      const f = formWith(c, "Add programme");
      await f.getByLabel("Name").fill(`M.Tech E2E ${run}`);
      await f.getByLabel("Semesters").fill("4");
    }, "Add programme", `Programme "M.Tech E2E ${run}" added.`),
  );
  // Crafted calls against another department's course (CS201) are refused.
  await callAction(rahul, "unlinkCourseSection", [cs201Id, cs201SectionId], "/instructor");
  await callAction(rahul, "removeCourseStaff", [cs201Id, karanId], "/instructor");
  await callAction(rahul, "enrolLinkedSections", [cs201Id], "/instructor");
  await admin.reload();
  await admin.getByRole("button", { name: /Unlink section/ }).first().waitFor();
  check(
    "a department admin's crafted calls can't touch another department's course",
    Boolean(cs201SectionId && karanId) &&
      (await admin.getByRole("button", { name: /Unlink section/ }).count()) === cs201Links &&
      (await seen(admin.getByRole("cell", { name: "Karan Mehra" }))),
  );
  const cseDeptId = await admin.locator("select[name=departmentId]").inputValue(); // CS201's department (CSE)
  const crossDept = await rahul.goto(`${BASE}/instructor/department/${cseDeptId}`);
  check("a department admin can't open another department's page", Boolean(cseDeptId) && crossDept.status() !== 500 && (await seen(rahul.getByText("Page not found"))));
  await rahul.context().close();

  // A coordinator manages their course's staff through the UI.
  const sara = await signIn("sara.thomas@eduwave.edu");
  await sara.goto(`${BASE}/instructor/courses`);
  await sara.getByText("Technical Communication").first().click();
  await sara.waitForURL(/\/instructor\/courses\/[0-9a-f-]{36}/);
  await sara.getByRole("tab", { name: /Participants/ }).click();
  const staffCard = sara.locator("section").filter({ has: sara.getByRole("heading", { name: "Course staff", exact: true }) });
  await staffCard.getByLabel("Instructor's email").fill("karan.mehra@eduwave.edu");
  await staffCard.getByRole("button", { name: "Add to staff" }).click();
  const added = await seen(sara.getByText("Karan Mehra added as teaching assistant."));
  sara.once("dialog", (d) => d.accept());
  await staffCard.getByRole("button", { name: "Remove Karan Mehra from the course staff" }).click();
  const removed = await sara.getByText("Karan Mehra removed.").first().waitFor({ timeout: 10000 }).then(() => true, () => false);
  check("a course coordinator adds and removes a teaching assistant", added && removed);
  await sara.context().close();

  // An instructor who is neither the course's coordinator nor a manager of its department
  // can't change its staff, even by crafted call. (Rahul teaches MA202 in Mathematics; his
  // department role is in another department.) Note: Meera is HOD of CSE, so she may.
  await admin.goto(`${BASE}/admin/courses`);
  await admin.getByRole("link", { name: "MA202" }).click();
  await admin.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}$/);
  const ma202Id = admin.url().split("/").pop();
  await submitIn(admin, "Course staff", async (c) => {
    const f = formWith(c, "Add to staff");
    await f.getByLabel("Instructor's email").fill("karan.mehra@eduwave.edu");
    await f.getByLabel("Role").selectOption("teaching_assistant");
  }, "Add to staff", "Karan Mehra added as teaching assistant.");
  const rahul2 = await signIn("rahul.verma@eduwave.edu");
  await callAction(rahul2, "removeCourseStaff", [ma202Id, karanId], "/instructor");
  await rahul2.context().close();
  await admin.reload();
  check(
    "an instructor who isn't coordinator or department manager can't remove course staff",
    Boolean(karanId) && (await seen(admin.getByRole("cell", { name: "Karan Mehra" }))),
  );
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
