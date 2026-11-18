import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell me={user} />;
}
