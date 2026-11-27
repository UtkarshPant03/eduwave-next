import { getActiveUser } from "@/lib/auth/dal";
import { listAllCourses } from "@/lib/data/admin";
import { listInstructorCourses, listStudentCourses } from "@/lib/data/courses";

/** Courses for the command palette, scoped to what the user can open. */
export async function GET() {
  const user = await getActiveUser();
  if (!user) return Response.json({ courses: [] }, { status: 401 });
  const rows =
    user.role === "student"
      ? await listStudentCourses(user.id)
      : user.role === "instructor"
        ? await listInstructorCourses(user.id)
        : await listAllCourses();
  const base = user.role === "admin" ? "/admin/courses" : `/${user.role}/courses`;
  return Response.json(
    {
      courses: rows.map((c) => ({
        label: `${c.code} · ${c.title}`,
        hint: c.term,
        href: user.role === "admin" ? base : `${base}/${c.id}`,
        kind: "course",
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
