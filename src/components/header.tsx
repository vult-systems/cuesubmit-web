"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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
}

const navItems = [
  { href: "/jobs", label: "Jobs" },
  { href: "/submit", label: "Submit" },
  { href: "/hosts", label: "Hosts" },
  { href: "/shows", label: "Shows" },
];

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

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
    <header className="sticky top-0 z-50 bg-surface-raised/80 backdrop-blur-md border-b border-border">
      {/* Content container */}
      <div className="relative max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Left: Logo + Product Name */}
          <div className="flex items-center">
            <Link href="/jobs" className="relative flex items-center gap-2.5 group">
              {/* Soft radial glow behind logo on hover */}
              <div
                className="absolute -inset-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-accent-subtle"
              />
              {/* Light mode: white logo, Dark mode: black logo */}
              <Image
                src="/uiw3d-logo-wht.png"
                alt="UIW3D"
                width={48}
                height={48}
                className="relative block dark:hidden"
              />
              <Image
                src="/uiw3d-logo-blk.png"
                alt="UIW3D"
                width={48}
                height={48}
                className="relative hidden dark:block"
              />
              <span className="relative text-[15px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                Render Manager
              </span>
            </Link>
          </div>

          {/* Center: Navigation pills */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200",
                    "border border-transparent",
                    isActive
                      ? "text-text-primary bg-surface-muted border-border"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-muted/50 hover:border-border-muted"
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-full pointer-events-none bg-accent-subtle" />
                  )}
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: Theme toggle + User menu */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded-full transition-colors"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-2 h-8 px-3 rounded-full transition-all duration-200",
                    "text-text-secondary hover:text-text-primary",
                    "border border-transparent hover:border-border hover:bg-surface-muted"
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-surface-muted flex items-center justify-center">
                    <User className="h-3 w-3" />
                  </div>
                  <span className="text-[13px] font-medium">{user.fullName || user.username}</span>
                  <span className="text-[11px] text-text-muted border border-border rounded px-1.5 py-0.5">
                    {user.role}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 bg-surface-raised backdrop-blur-md border-border shadow-xl"
              >
                <DropdownMenuLabel className="text-text-muted text-xs font-normal">
                  Signed in as <span className="text-text-secondary">{user.username}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                {user.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link
                      href="/admin/users"
                      className="flex items-center gap-2.5 cursor-pointer text-text-secondary focus:text-text-primary focus:bg-surface-muted"
                    >
                      <Settings className="h-3.5 w-3.5 text-text-muted" />
                      <span className="text-[13px]">Manage Users</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 cursor-pointer text-danger focus:text-danger focus:bg-danger-muted"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="text-[13px]">Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
