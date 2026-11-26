import { CheckCircle2, Clock, Info, Lock, Shuffle, XCircle } from "lucide-react";
import Link from "next/link";
import { startAttempt } from "@/app/actions/student";
import { Celebrate } from "@/components/client/celebrate";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { getStudentQuiz } from "@/lib/data";
import { formatDateTime, formatPercent, requestTime } from "@/lib/format";
import { attemptEndsAt } from "@/lib/quiz-engine";
import { QuizRunner } from "./quiz-runner";

export default async function StudentQuizPage({ params }: PageProps<"/student/quizzes/[quizId]">) {
  const { quizId } = await params;
  const student = await requireStudent();
  const { quiz, attempt, questions, revealAnswers } = await getStudentQuiz(student, quizId);
  const now = requestTime();
  const subtitle = `${quiz.subject} · ${questions.length} questions · ${quiz.timeLimitMinutes} min · due ${formatDateTime(quiz.deadline)}`;

  // 1. Not started yet
  if (!attempt) {
    const closed = quiz.deadline.getTime() <= now;
    const minutesToDeadline = Math.floor((quiz.deadline.getTime() - now) / 60_000);
    return (
      <>
        <PageHeader title={quiz.title} subtitle={subtitle} />
        <Card className="mx-auto max-w-xl">
          {closed ? (
            <p className="flex items-center gap-2 text-sm"><Lock className="size-4" /> The deadline has passed. This quiz can no longer be attempted.</p>
          ) : (
            <form action={startAttempt} className="space-y-5">
              <input type="hidden" name="quizId" value={quiz.id} />
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3"><Clock className="size-4 shrink-0 text-accent" /> You have {Math.min(quiz.timeLimitMinutes, minutesToDeadline)} minutes. The timer starts when you press Start and keeps running if you leave.</li>
                <li className="flex gap-3"><CheckCircle2 className="size-4 shrink-0 text-accent" /> Each answer is saved the moment you pick it. When time runs out, saved answers are submitted.</li>
                <li className="flex gap-3"><Lock className="size-4 shrink-0 text-accent" /> One attempt only.</li>
                {quiz.shuffle && <li className="flex gap-3"><Shuffle className="size-4 shrink-0 text-accent" /> Questions and options are shuffled for each student.</li>}
              </ul>
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
        <PageHeader title={quiz.title} subtitle={subtitle} />
        <QuizRunner
          quizId={quiz.id}
          questions={questions.map(({ id, prompt, options, selectedIndex }) => ({ id, prompt, options, selectedIndex }))}
          endsAtMs={endsAt}
          serverNowMs={now}
          totalMs={endsAt - attempt.startedAt.getTime()}
        />
      </>
    );
  }

  // 3. Submitted
  const percent = ((attempt.score ?? 0) / Math.max(attempt.total, 1)) * 100;
  const message = percent >= 80 ? "Excellent work! 🎉" : percent >= 50 ? "Good effort, keep going!" : "Keep practising. Review the explanations once they're available.";
  return (
    <>
      {percent >= 80 && <Celebrate id={attempt.id} />}
      <PageHeader title={quiz.title} subtitle={subtitle} />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing percent={percent} />
          <div>
            <p className="text-sm text-muted">Your score</p>
            <p className="text-3xl font-semibold tabular-nums">{attempt.score} / {attempt.total}</p>
            <p className="mt-1 text-sm">{message}</p>
          </div>
        </div>
        {!revealAnswers && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm text-muted">
            <Info className="size-4 shrink-0" />
            Correct answers and explanations appear after the deadline ({formatDateTime(quiz.deadline)}), once everyone has finished.
          </p>
        )}
      </Card>
      <Card title="Your answers">
        <ol className="space-y-6">
          {questions.map((q, i) => {
            const right = revealAnswers && q.selectedIndex === q.correctIndex;
            return (
              <li key={q.id} className="text-sm">
                <p className="flex items-start gap-2 font-medium">
                  {revealAnswers && (right ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Incorrect" />)}
                  {i + 1}. {q.prompt}
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {q.options.map((opt, k) => {
                    const picked = q.selectedIndex === k;
                    const correct = q.correctIndex === k;
                    return (
                      <li
                        key={k}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                          correct ? "border-success/50 bg-success/10" : picked && revealAnswers ? "border-danger/50 bg-danger/10" : picked ? "border-accent" : "border-border"
                        }`}
                      >
                        {opt}
                        <span className="flex gap-1">
                          {picked && <Badge tone={revealAnswers ? (correct ? "success" : "danger") : "accent"}>Your answer</Badge>}
                          {correct && <Badge tone="success">Correct</Badge>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {q.selectedIndex == null && <p className="mt-1 text-muted">Not answered.</p>}
                {q.explanation && <p className="mt-2 rounded-lg bg-surface-2 p-3 text-muted"><strong className="text-foreground">Why:</strong> {q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      </Card>
      <p className="mt-6 text-sm">
        <Link href="/student" className="text-accent hover:underline">← Back to dashboard</Link>
      </p>
    </>
  );
}

function ScoreRing({ percent }: { percent: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative size-24" role="img" aria-label={`${Math.round(percent)} percent`}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
        <circle cx="40" cy="40" r={R} fill="none" strokeWidth="7" strokeLinecap="round" stroke={percent >= 50 ? "var(--success)" : "var(--warning)"} strokeDasharray={C} strokeDashoffset={C * (1 - percent / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">{formatPercent(percent)}</span>
    </div>
  );
}
