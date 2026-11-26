import type { Metadata } from "next";
import { CalendarPage } from "@/components/pages/calendar-page";

export const metadata: Metadata = { title: "Calendar" };

export default function Page({ searchParams }: PageProps<"/student/calendar">) {
  return <CalendarPage role="student" searchParams={searchParams} />;
}
