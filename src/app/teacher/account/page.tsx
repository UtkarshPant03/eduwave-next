import type { Metadata } from "next";
import { AccountPage } from "@/components/pages/account-page";

export const metadata: Metadata = { title: "Account & security" };

export default function Page({ searchParams }: PageProps<"/teacher/account">) {
  return <AccountPage role="teacher" searchParams={searchParams} />;
}
