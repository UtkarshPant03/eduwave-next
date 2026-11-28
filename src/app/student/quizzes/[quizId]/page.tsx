import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock, Info, Lock, RotateCcw, Shuffle, XCircle } from "lucide-react";
import { startAttempt } from "@/app/actions/student";
import { QuizRunner } from "@/components/client/quiz-runner";
import { Badge, Button, Card, PageHeader, ProgressRing, Table } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { getStudentQuiz, type StudentQuizQuestion } from "@/lib/data/assessments";
import { formatDateTime, requestTime } from "@/lib/format";
import { GRADING_METHOD_LABEL } from "@/lib/questions";
import { attemptEndsAt } from "@/lib/quiz-engine";
import { routeIds } from "@/lib/route-ids";

export default async function StudentQuizPage({ params, searchParams }: PageProps<"/student/quizzes/[quizId]">) {
  const { quizId } = routeIds(await params);
  const sp = await searchParams;
  const requested = typeof sp.attempt === "string" && /^\d{1,2}$/.test(sp.attempt) ? Number(sp.attempt) : undefined;
  const user = await requireStudent();
  const { course, quiz, attempt, attempts, graded, canStart, notOpenYet, questionCount, questions, revealAnswers } = await getStudentQuiz(user, quizId, requested);
  const now = requestTime();
  const multi = quiz.maxAttempts > 1;
  const finished = attempts.filter((a) => a.submittedAt);
  const header = {
    breadcrumbs: [{ label: "My courses", href: "/student/courses" }, { label: course.code, href: `/student/courses/${course.id}` }, { label: quiz.title }],
    eyebrow: "Quiz",
    title: quiz.title,
    subtitle: `${questionCount} questions · ${quiz.timeLimitMinutes} min · ${quiz.opensAt && notOpenYet ? `opens ${formatDateTime(quiz.opensAt)} · ` : ""}due ${formatDateTime(quiz.deadline)}`,
  };
  const minutesToDeadline = Math.floor((quiz.deadline.getTime() - now) / 60_000);
  const rules = (
    <ul className="space-y-3 text-sm">
      <li className="flex gap-3"><Clock className="size-4 shrink-0 text-accent" /> You have {Math.min(quiz.timeLimitMinutes, minutesToDeadline)} minutes. The timer starts when you press Start and keeps running if you leave.</li>
      <li className="flex gap-3"><CheckCircle2 className="size-4 shrink-0 text-accent" /> Each answer is saved as you give it. When time runs out, saved answers are submitted.</li>
      <li className="flex gap-3">
        <Lock className="size-4 shrink-0 text-accent" />
        {multi ? `Up to ${quiz.maxAttempts} attempts, each with its own timer. ${GRADING_METHOD_LABEL[quiz.gradingMethod]} counts.` : "One attempt only."}
      </li>
      {quiz.shuffle && <li className="flex gap-3"><Shuffle className="size-4 shrink-0 text-accent" /> Questions and options are shuffled for each student.</li>}
    </ul>
  );

  // 1. Not started yet
  if (!attempt) {
    const closed = quiz.deadline.getTime() <= now;
    return (
      <>
        <PageHeader {...header} />
        <Card className="mx-auto max-w-xl">
          {closed ? (
            <p className="flex items-center gap-2 text-sm"><Lock className="size-4" /> The deadline has passed. This quiz can no longer be attempted.</p>
          ) : notOpenYet && quiz.opensAt ? (
            <div className="space-y-5">
              {quiz.description && <p className="text-sm">{quiz.description}</p>}
              <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm"><CalendarClock className="size-4 shrink-0 text-accent" /> This quiz opens {formatDateTime(quiz.opensAt)}. Come back then to start it.</p>
              {rules}
            </div>
          ) : (
            <form action={startAttempt} className="space-y-5">
              <input type="hidden" name="quizId" value={quiz.id} />
              {quiz.description && <p className="text-sm">{quiz.description}</p>}
              {rules}
              <Button className="w-full">Start quiz</Button>
            </form>
          )}
        </Card>
      </>
    );
  }

  // 2. In progress
  if (!attempt.submittedAt) {
    const endsAt = attemptEndsAt(attempt, quiz).getTime();
    return (
      <>
        <PageHeader {...header} subtitle={multi ? `Attempt ${attempt.attemptNumber} of ${quiz.maxAttempts} · ${header.subtitle}` : header.subtitle} />
        <QuizRunner
          quizId={quiz.id}
          questions={questions.map(({ id, type, prompt, points, options, response }) => ({ id, type, prompt, points, options, response }))}
          endsAtMs={endsAt}
          serverNowMs={now}
          totalMs={endsAt - attempt.startedAt.getTime()}
        />
      </>
    );
  }

  // 3. Submitted (reviewing one finished attempt)
  const percent = ((attempt.score ?? 0) / Math.max(attempt.total, 1)) * 100;
  const message = revealAnswers
    ? "Answers and explanations are shown below."
    : "Answers and explanations will be available after the quiz deadline.";
  return (
    <>
      <PageHeader {...header} />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing value={percent} size={96} label="Score" />
          <div>
            <p className="text-sm text-muted">{multi ? `Your score (attempt ${attempt.attemptNumber})` : "Your score"}</p>
            <p className="text-3xl font-semibold tabular-nums">{attempt.score} / {attempt.total}</p>
            {multi && graded && finished.length > 1 && (
              <p className="mt-1 text-sm">
                Counts towards your grade: <strong className="tabular-nums">{graded.score} / {graded.total}</strong> ({GRADING_METHOD_LABEL[quiz.gradingMethod].toLowerCase()})
              </p>
            )}
            <p className="mt-1 text-sm">{message}</p>
          </div>
          {canStart && (
            <form action={startAttempt} className="ml-auto">
              <input type="hidden" name="quizId" value={quiz.id} />
              <Button><RotateCcw className="size-4" /> Start attempt {finished.length + 1} of {quiz.maxAttempts}</Button>
            </form>
          )}
        </div>
        {!revealAnswers && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
            <Info className="size-4 shrink-0" /> Correct answers and explanations appear after the deadline ({formatDateTime(quiz.deadline)}), once everyone has finished.
          </p>
        )}
      </Card>

      {multi && (
        <Card title="Your attempts" className="mb-6" description={`${finished.length} of ${quiz.maxAttempts} used. ${GRADING_METHOD_LABEL[quiz.gradingMethod]} counts towards your grade.`}>
          <Table head={["Attempt", "Score", "Finished", ""]}>
            {attempts.map((a) => (
              <tr key={a.id}>
                <td className="px-2 py-2">Attempt {a.attemptNumber}</td>
                <td className="px-2 py-2 tabular-nums">{a.submittedAt ? `${a.score} / ${a.total}` : <Badge tone="accent">In progress</Badge>}</td>
                <td className="px-2 py-2 text-muted">{a.submittedAt ? formatDateTime(a.submittedAt) : "–"}</td>
                <td className="px-2 py-2 text-right">
                  {a.submittedAt && a.attemptNumber !== attempt.attemptNumber && (
                    <Link href={`/student/quizzes/${quiz.id}?attempt=${a.attemptNumber}`} className="text-accent hover:underline">Review attempt {a.attemptNumber}</Link>
                  )}
                  {a.attemptNumber === attempt.attemptNumber && <span className="text-xs text-muted">Shown below</span>}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title={multi ? `Your answers (attempt ${attempt.attemptNumber})` : "Your answers"}>
        <ol className="space-y-6">
          {questions.map((q, i) => <ReviewItem key={q.id} q={q} n={i + 1} revealed={revealAnswers} />)}
        </ol>
      </Card>
    </>
  );
}

function ReviewItem({ q, n, revealed }: { q: StudentQuizQuestion; n: number; revealed: boolean }) {
  const key = q.key;
  const r = q.response;
  const right = revealed && key?.correct;
  const noAnswer = r.selectedIndex == null && !r.selectedIndexes?.length && r.text == null && r.number == null;
  return (
    <li className="text-sm">
      <p className="flex items-start gap-2 font-medium">
        {revealed && (right ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Incorrect" />)}
        <span>{n}. {q.prompt}{q.points !== 1 && <span className="ml-1 font-normal text-muted">({q.points} points)</span>}</span>
      </p>
      {q.options.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {q.options.map((opt, k) => {
            const picked = q.type === "multiple" ? (r.selectedIndexes ?? []).includes(k) : r.selectedIndex === k;
            const correct = q.type === "multiple" ? (key?.correctIndexes ?? []).includes(k) : key?.correctIndex === k;
            return (
              <li key={k} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${correct ? "border-success/50 bg-success/10" : picked && revealed ? "border-danger/50 bg-danger/10" : picked ? "border-accent" : "border-border"}`}>
                {opt}
                <span className="flex gap-1">
                  {picked && <Badge tone={revealed ? (correct ? "success" : "danger") : "accent"}>Your answer</Badge>}
                  {correct && <Badge tone="success">Correct</Badge>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {(r.text != null || r.number != null) && (
            <p className={`rounded-xl border px-3 py-2 ${revealed ? (right ? "border-success/50 bg-success/10" : "border-danger/50 bg-danger/10") : "border-accent"}`}>
              Your answer: <strong>{r.text ?? r.number}</strong>
            </p>
          )}
          {key && (
            <p className="rounded-xl border border-success/50 bg-success/10 px-3 py-2">
              {q.type === "numerical"
                ? <>Correct answer: <strong>{key.numericAnswer}</strong>{key.tolerance ? <> (± {key.tolerance} accepted)</> : null}</>
                : <>Accepted answer{(key.acceptedAnswers?.length ?? 0) > 1 ? "s" : ""}: <strong>{key.acceptedAnswers?.join(" | ")}</strong></>}
            </p>
          )}
        </div>
      )}
      {q.type === "multiple" && <p className="mt-1 text-xs text-muted">Multiple answer: all-or-nothing.</p>}
      {noAnswer && <p className="mt-1 text-muted">Not answered.</p>}
      {key?.explanation && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-muted"><strong className="text-foreground">Why:</strong> {key.explanation}</p>}
    </li>
  );
}
