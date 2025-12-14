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
      router.push("/jobs");
      router.refresh();
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-surface border-border">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {/* Light mode: white logo, Dark mode: black logo */}
            <Image
              src="/uiw3d-logo-wht.png"
              alt="UIW3D"
              width={56}
              height={56}
              className="block dark:hidden"
            />
            <Image
              src="/uiw3d-logo-blk.png"
              alt="UIW3D"
              width={56}
              height={56}
              className="hidden dark:block"
            />
            <CardTitle className="text-2xl font-bold text-text-primary">Render Manager</CardTitle>
          </div>
          <CardDescription className="text-text-muted">
            Sign in to submit and monitor render jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-text-secondary">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                disabled={isLoading}
                className="bg-surface-muted border-border text-text-primary placeholder:text-text-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-text-secondary">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                className="bg-surface-muted border-border text-text-primary placeholder:text-text-muted"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent-muted text-white"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
