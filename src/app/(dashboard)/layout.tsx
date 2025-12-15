import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Header } from "@/components/header";
import { config } from "@/lib/config";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-text-primary">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-linear-to-br from-blue-200/10 via-transparent to-purple-200/10 dark:from-blue-950/10 dark:via-transparent dark:to-purple-950/10" />
        <div className="absolute top-0 left-1/4 w-125 h-125 bg-blue-400/4 dark:bg-blue-500/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-125 h-125 bg-purple-400/4 dark:bg-purple-500/3 rounded-full blur-3xl" />
      </div>
      
      {/* Main content */}
      <div className="relative">
        <Header user={user} mode={config.mode} />
        <main className="max-w-350 mx-auto px-6 sm:px-8 lg:px-12 py-8 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
