import Sidebar from "@/components/layout/Sidebar";
import { getAuthSession } from "@/services/auth-session";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar allowedSquads={session.allowedSquads} isAdmin={session.isAdmin} />
      <div className="ml-48 flex-1 min-w-0">{children}</div>
    </div>
  );
}
