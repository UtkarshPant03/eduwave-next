import Link from "next/link";
import { startAttempt } from "@/app/actions/student";
import { Button, Card, PageHeader } from "@/components/ui";
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
    return (
      <>
        <PageHeader title={quiz.title} subtitle={subtitle} />
        <Card>
          {closed ? (
            <p className="text-sm">The deadline has passed. This quiz can no longer be attempted.</p>
          ) : (
            <form action={startAttempt} className="space-y-4">
              <input type="hidden" name="quizId" value={quiz.id} />
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>You get one attempt. The timer starts when you press Start and keeps running if you leave.</li>
                <li>Each answer is saved as soon as you pick it.</li>
                <li>When time runs out, your saved answers are submitted automatically.</li>
              </ul>
              <Button>Start quiz</Button>
            </form>
          )}
        </Card>
      </>
    );
  }

  // 2. In progress
  if (!attempt.submittedAt) {
    return (
      <>
        <PageHeader title={quiz.title} subtitle={subtitle} />
        <QuizRunner
          quizId={quiz.id}
          questions={questions.map(({ id, prompt, options, selectedIndex }) => ({ id, prompt, options, selectedIndex }))}
          endsAtMs={attemptEndsAt(attempt, quiz).getTime()}
          serverNowMs={now}
        />
      </>
    );
  }

  // 3. Submitted
  const percent = ((attempt.score ?? 0) / Math.max(attempt.total, 1)) * 100;
  return (
    <>
      <PageHeader title={quiz.title} subtitle={subtitle} />
      <Card className="mb-6">
        <p className="text-sm text-muted">Your score</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {attempt.score} / {attempt.total} <span className="text-lg text-muted">({formatPercent(percent)})</span>
        </p>
        {!revealAnswers && (
          <p className="mt-3 text-sm text-muted">
            Correct answers will be shown after the deadline ({formatDateTime(quiz.deadline)}), once everyone has finished.
          </p>
        )}
      </Card>
      <Card title="Your answers">
        <ol className="space-y-5">
          {questions.map((q, i) => (
            <li key={q.id} className="text-sm">
              <p className="font-medium">{i + 1}. {q.prompt}</p>
              <ul className="mt-2 grid gap-1">
                {q.options.map((opt, k) => {
                  const picked = q.selectedIndex === k;
                  const correct = q.correctIndex === k;
                  return (
                    <li
                      key={k}
                      className={`rounded-md border px-3 py-1.5 ${
                        correct ? "border-success text-success" : picked && revealAnswers ? "border-danger text-danger" : picked ? "border-accent" : "border-border"
                      }`}
                    >
                      {opt}
                      {picked && " (your answer)"}
                      {correct && " ✓"}
                    </li>
                  );
                })}
              </ul>
              {q.selectedIndex == null && <p className="mt-1 text-muted">Not answered.</p>}
            </li>
          ))}
        </ol>
      </Card>
      <p className="mt-6 text-sm">
        <Link href="/student" className="text-accent underline">Back to quizzes</Link>
      </p>
    </>
  );
}
