"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Login failed");
        return;
      }

      toast.success(`Welcome, ${data.user.fullName || data.user.username}!`);
      
      // Use window.location for reliable redirect in production
      window.location.href = "/jobs";
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-linear-to-br from-surface/30 via-background to-surface/20 pointer-events-none" />
      
      {/* Subtle animated orbs for depth */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-neutral-200/50 dark:bg-white/2 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-neutral-200/50 dark:bg-white/2 rounded-full blur-3xl animate-float animate-delay-500" />
      
      <Card className="relative w-full max-w-md bg-white/80 dark:bg-surface/30 backdrop-blur-2xl border-neutral-200 dark:border-white/8 shadow-2xl shadow-black/10 dark:shadow-black/50 animate-scale-in">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-3 mb-6 animate-fade-up">
            {/* Light mode: white logo, Dark mode: black logo */}
            <Image
              src="/uiw3d-logo-wht.png"
              alt="UIW3D"
              width={72}
              height={72}
              className="block dark:hidden drop-shadow-lg"
            />
            <Image
              src="/uiw3d-logo-blk.png"
              alt="UIW3D"
              width={72}
              height={72}
              className="hidden dark:block drop-shadow-lg"
            />
          </div>
          <CardTitle className="text-3xl font-semibold text-text-primary tracking-tight animate-fade-up animate-delay-100">
            Queue
          </CardTitle>
          <CardDescription className="text-text-muted text-sm mt-2 animate-fade-up animate-delay-200">
            Sign in to submit and monitor render jobs
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2 animate-fade-up animate-delay-300">
              <Label htmlFor="username" className="text-text-secondary text-sm font-medium">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                disabled={isLoading}
                className="h-12 bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 text-text-primary placeholder:text-text-muted focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 focus:ring-0 transition-all duration-300"
              />
            </div>
            <div className="space-y-2 animate-fade-up animate-delay-400">
              <Label htmlFor="password" className="text-text-secondary text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                className="h-12 bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 text-text-primary placeholder:text-text-muted focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 focus:ring-0 transition-all duration-300"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-white/90 text-white dark:text-black font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-neutral-900/20 dark:hover:shadow-white/20 hover:-translate-y-0.5 btn-shine animate-fade-up animate-delay-500"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
