import type { Metadata } from "next";
import { CalendarPage } from "@/components/pages/calendar-page";

export const metadata: Metadata = { title: "Calendar" };

export default function Page({ searchParams }: PageProps<"/instructor/calendar">) {
  return <CalendarPage role="instructor" searchParams={searchParams} />;
}
