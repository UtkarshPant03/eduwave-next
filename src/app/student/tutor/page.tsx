import type { Metadata } from "next";
import { Bot, ShieldCheck } from "lucide-react";
import { TutorChat } from "@/components/client/tutor-chat";
import { Card, PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireStudent } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "AI tutor" };

export default async function TutorPage() {
  await requireStudent();

  if (!aiEnabled()) {
    return (
      <>
        <PageHeader title="AI tutor" />
        <Card className="mx-auto max-w-xl text-sm">
          <Bot className="mb-3 size-8 text-accent" />
          <p className="font-medium">The AI tutor isn&apos;t switched on for this school yet.</p>
          <p className="mt-2 text-muted">
            It runs on a free, open-source model through Ollama, so your questions stay on the school&apos;s own computer. Ask your
            teacher or administrator to enable it (setup steps are in the project README).
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI tutor"
        subtitle={
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" /> Runs on your school&apos;s own server. AI can be wrong: check important facts with your notes or teacher.
          </span>
        }
      />
      <TutorChat />
    </>
  );
}
