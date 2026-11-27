import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  KeyRound,
  Layers,
  Lock,
  MessagesSquare,
  PenTool,
  ShieldCheck,
  Timer,
  Users,
  Video,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { buttonClass } from "@/components/ui";

const FEATURES = [
  { icon: Layers, title: "Structured courses", body: "Weekly sections with materials, assignments, quizzes and live sessions, and per-student progress tracking." },
  { icon: FileUp, title: "Assignments", body: "File or text submissions, deadlines with late windows, inline grading and written feedback." },
  { icon: Timer, title: "Secure quizzes", body: "Server-timed, server-graded, shuffled per student. Answer keys stay hidden until the deadline." },
  { icon: ClipboardCheck, title: "Gradebook", body: "Points, percentages and a 10-point grade scale, with CSV export for every course." },
  { icon: MessagesSquare, title: "Discussions", body: "Course forums with pinned announcements, replies, moderation and notifications." },
  { icon: Video, title: "Live classes", body: "Scheduled video sessions on open-source Jitsi Meet. No licence fees, no installs." },
  { icon: CalendarDays, title: "Calendar", body: "Every deadline and live class across all your courses in one month view." },
  { icon: GraduationCap, title: "Self-enrolment", body: "A course catalogue where students join with an enrolment key, or instructors add them by student ID." },
  { icon: PenTool, title: "Whiteboards", body: "Sketch, diagram and share boards with a class, autosaved as you draw." },
  { icon: BarChart3, title: "Analytics", body: "Score distributions and per-question breakdowns show which topics a class finds hardest." },
  { icon: BellRing, title: "Notifications", body: "In-app alerts for new work, grades and announcements, with optional email." },
  { icon: ShieldCheck, title: "Security first", body: "Hashed sessions, account lockout, audit logs, upload checks and strict headers." },
];

const ROLES = [
  {
    icon: GraduationCap,
    title: "For students",
    points: ["One dashboard for every course and deadline", "Submit work, take quizzes, track grades", "Discuss with classmates in course forums", "Study timer and personal to-do list"],
  },
  {
    icon: Users,
    title: "For instructors",
    points: ["Build courses week by week", "Grade submissions with feedback in one place", "See which questions the class finds hardest", "Announce, schedule live classes and export grades"],
  },
  {
    icon: KeyRound,
    title: "For administrators",
    points: ["Provision users individually or by CSV", "Create courses and assign instructors", "Deactivate accounts instantly", "Site-wide audit log of security events"],
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Logo />
          <nav aria-label="Page sections" className="ml-6 hidden gap-6 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#roles" className="hover:text-foreground">Who it&apos;s for</a>
            <a href="#security" className="hover:text-foreground">Security</a>
          </nav>
          <Link href="/login" className={`${buttonClass()} ml-auto`}>
            Sign in <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="text-sm font-medium text-muted">Learning management system</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Where university courses come together.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">
              Course content, assignments, quizzes, grades, discussions and live classes in one secure platform for
              students, instructors and administrators.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={buttonClass()}>
                Sign in <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a href="#features" className={buttonClass("secondary")}>Explore features</a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted">
              <Lock className="size-4" aria-hidden /> Accounts are issued by your institution. There is no public sign-up.
            </p>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Everything a course needs</h2>
          <p className="mt-2 max-w-2xl text-muted">Organised the way universities teach: by course, by week, by activity.</p>
          <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <dt className="flex items-center gap-3 font-semibold">
                  <Icon className="size-5 shrink-0 text-accent" aria-hidden /> {title}
                </dt>
                <dd className="mt-1 pl-8 text-sm text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="roles" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Built for every role on campus</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {ROLES.map(({ icon: Icon, title, points }) => (
                <div key={title} className="rounded-xl border border-border p-5">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Icon className="size-5 text-accent" aria-hidden /> {title}
                  </h3>
                  <ul className="mt-4 space-y-2 text-sm">
                    {points.map((pt) => (
                      <li key={pt} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                <ShieldCheck className="size-6 text-accent" aria-hidden /> Academic records, protected
              </h2>
              <p className="mt-3 text-muted">
                Grades and submissions are protected by the database itself, not only by the interface, and every grade
                change is kept in a permanent history.
              </p>
            </div>
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                "Every request is authorised on the server",
                "Students can never see each other's work",
                "Server-timed, server-graded quizzes",
                "Graded work can't be deleted or overwritten",
                "Account lockout and session revocation",
                "Audit log for security and academic events",
              ].map((t) => (
                <li key={t} className="flex gap-2 rounded-lg border border-border bg-surface p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>eduWave Learning Management System</span>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
