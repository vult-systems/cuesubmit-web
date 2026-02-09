"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BackendMode } from "@/lib/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Settings, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface HeaderProps {
  user: {
    username: string;
    role: string;
    fullName: string | null;
  };
  mode?: BackendMode;
}

const navItems = [
  { href: "/jobs", label: "Jobs" },
  { href: "/submit", label: "Submit" },
  { href: "/hosts", label: "Hosts" },
  { href: "/shows", label: "Shows" },
];

export function Header({ user, mode }: Readonly<HeaderProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isDev = process.env.NODE_ENV === "development";

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Logged out successfully");
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to log out");
    }
  };

  return (
    <header className="sticky top-0 z-50">
      {/* Background with blur */}
      <div className="absolute inset-0 bg-white/80 dark:bg-black/20 backdrop-blur-2xl" />
      {/* Bottom fade gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-8 -mb-8 bg-linear-to-b from-white/80 to-transparent dark:from-neutral-950/80 dark:to-transparent pointer-events-none" />
      {/* Content container */}
      <div className="relative max-w-350 mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Logo + Product Name */}
          <div className="flex items-center animate-fade-in">
            <Link href="/jobs" className="relative flex items-center gap-3 group">
              {/* Soft glow behind logo on hover */}
              <div
                className="absolute -inset-6 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 pointer-events-none blur-xl"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)' }}
              />
              {/* Light mode: white logo, Dark mode: black logo */}
              <Image
                src="/uiw3d-logo-wht.png"
                alt="UIW3D"
                width={40}
                height={40}
                className="relative block dark:hidden transition-transform duration-300 group-hover:scale-105"
              />
              <Image
                src="/uiw3d-logo-blk.png"
                alt="UIW3D"
                width={40}
                height={40}
                className="relative hidden dark:block transition-transform duration-300 group-hover:scale-105"
              />
              <span className="relative text-base font-medium text-text-primary group-hover:text-text-primary transition-all duration-300">
                Render Queue
              </span>
            </Link>
          </div>

          {/* Center: Navigation - x.ai style */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8 animate-fade-in">
            {navItems.map((item, index) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm transition-opacity duration-200",
                    isActive
                      ? "text-text-primary opacity-100"
                      : "text-text-primary opacity-50 hover:opacity-100"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Theme toggle + User menu */}
          <div className="flex items-center gap-2">
            {isDev && mode && (
              <span
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
                  mode === "online"
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning"
                )}
                aria-label={`Current backend mode: ${mode}`}
              >
                <span className="h-1.5 w-1.5 rounded-full animate-subtle-pulse" aria-hidden
                  style={{
                    backgroundColor: mode === "online" ? "rgb(74 222 128)" : "rgb(251 191 36)",
                  }}
                />
                {mode.toUpperCase()}
              </span>
            )}
            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 text-text-muted hover:text-text-primary dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-all duration-300"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-2.5 h-9 px-3 rounded-full transition-all duration-300",
                    "text-text-muted hover:text-text-primary dark:hover:text-white",
                    "hover:bg-neutral-100 dark:hover:bg-white/5 border border-transparent hover:border-neutral-200 dark:hover:border-white/8"
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center border border-neutral-200 dark:border-white/8">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium">{user.fullName || user.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-white dark:bg-surface/95 backdrop-blur-xl border-neutral-200 dark:border-white/8 shadow-2xl shadow-black/10 dark:shadow-black/60 animate-scale-in"
              >
                <DropdownMenuLabel className="text-text-muted text-xs font-normal px-3 py-2">
                  Signed in as <span className="text-text-primary font-medium">{user.username}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link
                      href="/admin/users"
                      className="flex items-center gap-2.5 cursor-pointer text-text-muted hover:text-text-primary dark:hover:text-white focus:text-text-primary dark:focus:text-white focus:bg-neutral-100 dark:focus:bg-white/5 mx-1 rounded-lg transition-all duration-200"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="text-sm">Manage Users</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 cursor-pointer text-text-muted hover:text-danger focus:text-danger focus:bg-danger/10 mx-1 rounded-lg transition-all duration-200"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
