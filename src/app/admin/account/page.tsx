import type { Metadata } from "next";
import { AccountPage } from "@/components/pages/account-page";

export const metadata: Metadata = { title: "Profile & security" };

export default function Page({ searchParams }: PageProps<"/admin/account">) {
  return <AccountPage role="admin" searchParams={searchParams} />;
}
