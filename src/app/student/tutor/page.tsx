import type { Metadata } from "next";
import { Bot, ShieldCheck } from "lucide-react";
import { TutorChat } from "@/components/client/tutor-chat";
import { Card, IconChip, PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireStudent } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "AI tutor" };

export default async function TutorPage() {
  await requireStudent();
  if (!aiEnabled()) {
    return (
      <>
        <PageHeader eyebrow="Tools" title="AI tutor" />
        <Card className="bg-mesh mx-auto max-w-xl text-sm">
          <IconChip size="lg"><Bot /></IconChip>
          <p className="mt-4 font-medium">The AI tutor isn&apos;t switched on for your institution yet.</p>
          <p className="mt-2 text-muted">
            It runs on a free, open-source model through Ollama, so your questions stay on the institution&apos;s own server. Ask your
            administrator to enable it (setup steps are in the project README).
          </p>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Tools"
        title="AI tutor"
        subtitle={<span className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Runs on your institution&apos;s server. AI can be wrong: check important facts with your notes or instructor.</span>}
      />
      <TutorChat />
    </>
  );
}
