import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { TutorChat } from "@/components/client/tutor-chat";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireStudent } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "AI tutor" };

export default async function TutorPage() {
  await requireStudent();
  // Not linked anywhere while AI is off; a direct visit gets a normal 404.
  if (!aiEnabled()) notFound();
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
