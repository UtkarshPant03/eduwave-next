import type { Metadata } from "next";
import { BoardsPage } from "@/components/pages/boards-page";

export const metadata: Metadata = { title: "Whiteboards" };

export default function Page() {
  return <BoardsPage role="student" />;
}
