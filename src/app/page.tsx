import Link from "next/link";
import { buttonClass } from "@/components/ui";

const features = [
  { title: "Classes & students", body: "Teachers create classes and issue student logins. No open student sign-up." },
  { title: "Fair quizzes", body: "Timed on the server, graded on the server, one attempt each. Answers stay hidden until the deadline." },
  { title: "Progress you can trust", body: "Per-question analytics for teachers; subject-wise stats and class leaderboards for students." },
  { title: "Shared resources", body: "Links to readings, videos and notes, organised by class and subject." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm font-medium text-accent">eduWave</p>
      <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        A focused classroom for quizzes, resources and progress.
      </h1>
      <p className="mt-4 max-w-xl text-muted">
        A reference rebuild of the original MERN eduWave project with Next.js, TypeScript and PostgreSQL.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className={buttonClass()}>Log in</Link>
        <Link href="/register" className={buttonClass("secondary")}>Register as teacher</Link>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-lg border border-border bg-surface p-5">
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
