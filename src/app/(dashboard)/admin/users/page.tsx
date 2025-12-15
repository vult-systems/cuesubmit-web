"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Search,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { iconButton } from "@/lib/icon-button-styles";
import { GroupedSection } from "@/components/grouped-section";
import { accentColorList } from "@/lib/accent-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface User {
  id: string;
  username: string;
  role: "admin" | "manager" | "student";
  full_name: string | null;
  created_at: string;
  last_login: string | null;
}

const roleLabels: Record<string, string> = {
  admin: "ADMINISTRATORS",
  manager: "MANAGERS",
  student: "STUDENTS",
};

const roleOrder = ["admin", "manager", "student"];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("student");
  const [newFullName, setNewFullName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<string>("student");
  const [editFullName, setEditFullName] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset password dialog state
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/users");
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users || []);
      } else {
        toast.error(data.error || "Failed to fetch users");
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async () => {
    if (!newUsername.trim()) {
      toast.error("Username is required");
      return;
    }
    if (!newPassword.trim()) {
      toast.error("Password is required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          fullName: newFullName.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("User created successfully");
        setCreateDialogOpen(false);
        setNewUsername("");
        setNewPassword("");
        setNewRole("student");
        setNewFullName("");
        fetchUsers();
      } else {
        toast.error(data.error || "Failed to create user");
      }
    } catch (error) {
      console.error("Failed to create user:", error);
      toast.error("Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleEditUser = async () => {
    if (!userToEdit) return;

    setSaving(true);
    try {
      const response = await fetch("/api/auth/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userToEdit.id,
          role: editRole,
          fullName: editFullName.trim() || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("User updated successfully");
        setEditDialogOpen(false);
        setUserToEdit(null);
        fetchUsers();
      } else {
        toast.error(data.error || "Failed to update user");
      }
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/auth/users?id=${userToDelete.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("User deleted successfully");
        setDeleteDialogOpen(false);
        setUserToDelete(null);
        fetchUsers();
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!userToResetPassword) return;
    if (!newPasswordForReset.trim()) {
      toast.error("New password is required");
      return;
    }
    if (newPasswordForReset.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setResettingPassword(true);
    try {
      const response = await fetch("/api/auth/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userToResetPassword.id,
          newPassword: newPasswordForReset,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Password reset successfully");
        setResetPasswordDialogOpen(false);
        setUserToResetPassword(null);
        setNewPasswordForReset("");
      } else {
        toast.error(data.error || "Failed to reset password");
      }
    } catch (error) {
      console.error("Failed to reset password:", error);
      toast.error("Failed to reset password");
    } finally {
      setResettingPassword(false);
    }
  };

  const openEditDialog = (user: User) => {
    setUserToEdit(user);
    setEditRole(user.role);
    setEditFullName(user.full_name || "");
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const openResetPasswordDialog = (user: User) => {
    setUserToResetPassword(user);
    setNewPasswordForReset("");
    setResetPasswordDialogOpen(true);
  };

  // Filter users
  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(globalFilter.toLowerCase()) ||
    (user.full_name || "").toLowerCase().includes(globalFilter.toLowerCase())
  );

  // Group by role
  const usersByRole = filteredUsers.reduce((acc, user) => {
    const role = user.role;
    if (!acc[role]) acc[role] = [];
    acc[role].push(user);
    return acc;
  }, {} as Record<string, User[]>);

  // Sort roles in order
  const sortedRoles = roleOrder.filter((role) => usersByRole[role]?.length > 0);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "manager":
        return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
      default:
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
    }
  };

  const renderUserRow = (user: User) => (
    <TableRow
      key={user.id}
      className="hover:bg-neutral-50 dark:hover:bg-white/3 transition-all duration-200 group border-neutral-200 dark:border-white/6"
    >
      <TableCell className="pl-8 font-medium text-text-primary text-sm">
        {user.username}
      </TableCell>
      <TableCell className="text-text-secondary text-sm">
        {user.full_name || "-"}
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant="outline"
          className={cn("text-xs capitalize", getRoleBadgeStyle(user.role))}
        >
          {user.role}
        </Badge>
      </TableCell>
      <TableCell className="text-text-muted text-sm text-center">
        {formatDate(user.created_at)}
      </TableCell>
      <TableCell className="text-text-muted text-sm text-center">
        {formatDate(user.last_login)}
      </TableCell>
      <TableCell className="pr-8">
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center justify-center gap-0.5">
            {/* Edit */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton.edit}
                  onClick={() => openEditDialog(user)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit</p>
              </TooltipContent>
            </Tooltip>

            {/* Reset Password */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton.settings}
                  onClick={() => openResetPasswordDialog(user)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset Password</p>
              </TooltipContent>
            </Tooltip>

            {/* Delete */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton.delete}
                  onClick={() => openDeleteDialog(user)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );

  const renderTable = (usersList: User[]) => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
          <TableHead className="pl-8">Username</TableHead>
          <TableHead>Full Name</TableHead>
          <TableHead className="text-center">Role</TableHead>
          <TableHead className="text-center">Created</TableHead>
          <TableHead className="text-center">Last Login</TableHead>
          <TableHead className="text-center pr-8">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {usersList.map(renderUserRow)}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Users</h1>
          <p className="text-text-muted text-xs mt-1">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} across {sortedRoles.length} role{sortedRoles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-text-primary transition-colors duration-300" />
            <Input
              placeholder="Search users..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 w-64 h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
            />
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 h-8 px-3 text-xs font-medium rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <Plus className="h-3.5 w-3.5" />
                New User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-text-primary">Create New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-text-muted text-xs font-medium">
                    Username
                  </Label>
                  <Input
                    id="username"
                    placeholder="e.g., jsmith"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-text-muted text-xs font-medium">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-text-muted text-xs font-medium">
                    Full Name (optional)
                  </Label>
                  <Input
                    id="fullName"
                    placeholder="e.g., John Smith"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-text-muted text-xs font-medium">
                    Role
                  </Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => setCreateDialogOpen(false)}
                    className="h-8 px-4 text-xs hover:bg-white/5 rounded-lg transition-all duration-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateUser}
                    disabled={creating}
                    className="h-8 px-4 text-xs bg-white hover:bg-white/90 text-black font-medium rounded-lg transition-all duration-300"
                  >
                    {creating ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setLoading(true);
              fetchUsers();
            }}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5 hover:border-neutral-300 dark:hover:border-white/12 transition-all duration-300"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-neutral-300 dark:border-white/20 border-t-neutral-700 dark:border-t-white rounded-full animate-spin" />
          <span className="text-text-muted text-sm">Loading users...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredUsers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <span className="text-text-muted">No users found</span>
          <span className="text-text-muted/50 text-xs">Create a new user to get started</span>
        </div>
      )}

      {/* Grouped Sections */}
      {!loading && filteredUsers.length > 0 && (
        <div className="space-y-3">
          {sortedRoles.map((role, index) => (
            <GroupedSection
              key={role}
              title={roleLabels[role] || role.toUpperCase()}
              badge={`${usersByRole[role].length}`}
              accentColors={accentColorList[index % accentColorList.length]}
              defaultOpen={true}
            >
              {renderTable(usersByRole[role])}
            </GroupedSection>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Edit User</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Update details for &quot;{userToEdit?.username}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="editFullName" className="text-text-muted text-xs font-medium">
                Full Name
              </Label>
              <Input
                id="editFullName"
                placeholder="e.g., John Smith"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editRole" className="text-text-muted text-xs font-medium">
                Role
              </Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setEditDialogOpen(false)}
                className="h-8 px-4 text-xs hover:bg-white/5 rounded-lg transition-all duration-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditUser}
                disabled={saving}
                className="h-8 px-4 text-xs bg-white hover:bg-white/90 text-black font-medium rounded-lg transition-all duration-300"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Delete User</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Permanently delete &quot;{userToDelete?.username}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              className="h-8 px-4 text-xs rounded-lg transition-all duration-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteUser}
              disabled={deleting}
              variant="destructive"
              className="h-8 px-4 text-xs font-medium rounded-lg transition-all duration-300"
            >
              {deleting ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Reset Password</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Set a new password for &quot;{userToResetPassword?.username}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-text-muted text-xs font-medium">
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Min 6 characters"
                value={newPasswordForReset}
                onChange={(e) => setNewPasswordForReset(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleResetPassword();
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setResetPasswordDialogOpen(false)}
                className="h-8 px-4 text-xs hover:bg-white/5 rounded-lg transition-all duration-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={resettingPassword}
                className="h-8 px-4 text-xs bg-white hover:bg-white/90 text-black font-medium rounded-lg transition-all duration-300"
              >
                {resettingPassword ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
