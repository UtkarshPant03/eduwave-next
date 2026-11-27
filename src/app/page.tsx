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
import { CourseCover } from "@/components/course-cover";
import { buttonClass, IconChip } from "@/components/ui";

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
  { icon: BarChart3, title: "Analytics", body: "Score distributions, per-question breakdowns and progress against the class average." },
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

const STACK = ["Next.js", "TypeScript", "PostgreSQL", "Drizzle ORM", "Tailwind CSS", "Jitsi Meet", "Excalidraw"];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden gap-6 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#roles" className="hover:text-foreground">Who it&apos;s for</a>
            <a href="#security" className="hover:text-foreground">Security</a>
          </nav>
          <Link href="/login" className={`${buttonClass()} ml-auto`}>
            Sign in <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-mesh relative overflow-hidden">
        <div className="bg-dots absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div className="animate-fade-in">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent" /> Open-source learning management system
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Where university courses <span className="text-gradient">come together.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Course content, assignments, quizzes, grades, discussions and live classes in one secure platform for
              students, instructors and administrators.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={buttonClass()}>
                Sign in to your campus <ArrowRight className="size-4" />
              </Link>
              <a href="#features" className={buttonClass("secondary")}>Explore features</a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted">
              <Lock className="size-3.5" /> Accounts are issued by your institution. There is no public sign-up.
            </p>
          </div>

          {/* Product preview built from real UI pieces (no screenshots needed) */}
          <div className="relative hidden lg:block" aria-hidden>
            <div className="animate-float rounded-3xl border border-border bg-surface p-5 shadow-card-lg">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">Good morning,</p>
                  <p className="font-semibold">Ananya</p>
                </div>
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">3 due this week</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { code: "CS201", title: "Data Structures", color: "indigo", p: 72 },
                  { code: "MA202", title: "Probability & Statistics", color: "teal", p: 48 },
                  { code: "CS204", title: "Database Systems", color: "violet", p: 85 },
                  { code: "HS101", title: "Technical Communication", color: "amber", p: 30 },
                ].map((c) => (
                  <div key={c.code} className="overflow-hidden rounded-2xl border border-border">
                    <CourseCover code={c.code} color={c.color} className="h-14" />
                    <div className="p-3">
                      <p className="truncate text-xs font-medium">{c.title}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="bg-brand h-full rounded-full" style={{ width: `${c.p}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { icon: FileUp, t: "Lab 4: Binary search trees", d: "Due Thu, 11:59 pm", tone: "accent" as const },
                  { icon: Timer, t: "Quiz 2: Probability", d: "Opens Fri, 10:00 am", tone: "warning" as const },
                  { icon: Video, t: "Live: Normalisation Q&A", d: "Mon, 4:00 pm", tone: "success" as const },
                ].map((r) => (
                  <div key={r.t} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                    <IconChip tone={r.tone} size="sm"><r.icon /></IconChip>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{r.t}</p>
                      <p className="text-[11px] text-muted">{r.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 rounded-2xl border border-border bg-surface p-3 shadow-card-lg" style={{ animation: "float 8s ease-in-out infinite reverse" }}>
              <p className="flex items-center gap-2 text-xs font-medium"><CheckCircle2 className="size-4 text-success" /> Assignment graded · 18/20</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-accent">Everything in one place</p>
        <h2 className="mx-auto mt-2 max-w-2xl text-center text-3xl font-semibold tracking-tight">A complete toolkit for teaching and learning</h2>
        <div className="stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-hover rounded-2xl border border-border bg-surface p-5 shadow-card">
              <IconChip size="lg"><f.icon /></IconChip>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="scroll-mt-20 border-y border-border bg-surface/60">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-20 sm:px-6 lg:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className="bg-brand grid size-11 place-items-center rounded-xl text-white"><r.icon className="size-5" /></span>
                <h3 className="text-lg font-semibold">{r.title}</h3>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm">
                {r.points.map((p) => (
                  <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="bg-mesh grid items-center gap-10 overflow-hidden rounded-3xl border border-border bg-surface p-8 shadow-card lg:grid-cols-2 lg:p-12">
          <div>
            <IconChip size="lg"><ShieldCheck /></IconChip>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Built to protect student data</h2>
            <p className="mt-3 text-muted">
              Grades and submissions are sensitive. eduWave checks permissions on the server for every request and keeps
              a record of every security event.
            </p>
          </div>
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {["httpOnly, revocable sessions", "Lockout after repeated failed sign-ins", "Server-side quiz timing and grading", "Uploads verified by file signature", "Strict security headers (CSP, HSTS)", "Audit log for sign-ins and changes"].map((s) => (
              <li key={s} className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3"><Lock className="size-4 text-accent" /> {s}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Stack */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">Built entirely on open-source software</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {STACK.map((s) => (
            <span key={s} className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-muted">{s}</span>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <Logo />
          <p>eduWave LMS · An open-source learning platform</p>
          <Link href="/login" className="hover:text-foreground">Sign in →</Link>
        </div>
      </footer>
    </div>
  );
}
