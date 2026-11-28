import { courseForInstructor } from "@/lib/access";
import { audit } from "@/lib/audit";
import { getActiveUser } from "@/lib/auth/dal";
import { csvString } from "@/lib/csv";
import { db } from "@/db";
import { fileData, latestSubmissionsForDownload } from "@/lib/data/assessments";
import { routeIds } from "@/lib/route-ids";
import { safeZipSegment, uniqueName, zipStream, type ZipEntry } from "@/lib/zip";

/**
 * "Download all": the latest version of every submission as one ZIP, one folder per
 * student named with the university ID. Graders only (`grade.edit`); students get 401 and
 * staff of other courses the same 404 as for a missing assignment.
 */
export async function GET(_: Request, ctx: RouteContext<"/instructor/assignments/[assignmentId]/download">) {
  const user = await getActiveUser();
  if (!user || user.role !== "instructor") return new Response("Unauthorized", { status: 401 });
  const { assignmentId } = routeIds(await ctx.params);
  const assignment = await db.query.assignments.findFirst({ where: (a, { eq }) => eq(a.id, assignmentId) });
  if (!assignment) return new Response("Not found", { status: 404 });
  const course = await courseForInstructor(user, assignment.courseId, "grade.edit");

  const subs = await latestSubmissionsForDownload(assignment.id);
  const entries: ZipEntry[] = [];
  const folders = new Set<string>(["submissions.csv"]);
  const manifest: unknown[][] = [["Student ID", "Name", "Folder", "Version", "Submitted at (UTC)", "Late", "Files"]];
  for (const s of subs) {
    const v = s.latest;
    if (!v) continue;
    const folder = uniqueName(folders, safeZipSegment(s.universityId ?? "", `student-${s.userId.slice(0, 8)}`));
    const names = new Set<string>();
    if (v.text) {
      const text = new TextEncoder().encode(v.text);
      entries.push({ path: `${folder}/${uniqueName(names, "online-text.txt")}`, data: () => text, modified: v.submittedAt });
    }
    for (const f of v.files) {
      entries.push({ path: `${folder}/${uniqueName(names, safeZipSegment(f.name))}`, data: () => fileData(f.id), modified: v.submittedAt });
    }
    manifest.push([s.universityId ?? "", s.name, folder, v.versionNumber, v.submittedAt.toISOString(), v.submittedAt > assignment.dueAt ? "yes" : "", v.files.length]);
  }
  const list = new TextEncoder().encode(csvString(manifest));
  entries.unshift({ path: "submissions.csv", data: () => list });

  await audit(user.id, "submissions_downloaded", `${course.code} ${course.term}: assignment ${assignment.id} (${subs.length} submissions)`);
  const name = safeZipSegment(`${course.code}-${assignment.title}-submissions`, "submissions");
  return new Response(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
