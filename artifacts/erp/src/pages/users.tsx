import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, Pencil, Trash2, KeyRound, Loader2, UserCheck, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ROLE_LABELS, useAuth, type UserRole } from "@/contexts/auth-context";

interface UserItem {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: "owner", label: "老闆" },
  { value: "admin", label: "行政管理" },
  { value: "sales", label: "業務" },
  { value: "engineer", label: "工程師" },
  { value: "technician", label: "技術員" },
  { value: "accountant", label: "會計" },
  { value: "distributor", label: "批發商" },
];

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 border border-amber-200",
  admin: "bg-blue-100 text-blue-800 border border-blue-200",
  sales: "bg-green-100 text-green-800 border border-green-200",
  engineer: "bg-purple-100 text-purple-800 border border-purple-200",
  technician: "bg-slate-100 text-slate-700 border border-slate-200",
  accountant: "bg-pink-100 text-pink-800 border border-pink-200",
  distributor: "bg-orange-100 text-orange-800 border border-orange-200",
};

const TOKEN_KEY = "erp_auth_token";

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

const EMPTY_CREATE = { username: "", password: "", displayName: "", role: "technician" as UserRole };
const EMPTY_EDIT = { displayName: "", username: "", role: "technician" as UserRole, isActive: true };

export default function UsersPage() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);

  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<UserItem[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("無法載入使用者");
      return res.json() as Promise<UserItem[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: typeof createForm) => {
      const res = await authFetch("/api/users", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "建立失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      setCreateError(null);
      toast({ title: "使用者已建立", description: "首次登入需強制變更密碼" });
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : "建立失敗"),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: typeof editForm }) => {
      const res = await authFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "更新失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
      setEditError(null);
      toast({ title: "使用者已更新" });
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "更新失敗"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "刪除失敗");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      toast({ title: "使用者已刪除" });
    },
    onError: (err) => {
      setDeleteTarget(null);
      toast({ title: "刪除失敗", description: err instanceof Error ? err.message : "請稍後再試", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: number; newPassword: string }) => {
      const res = await authFetch(`/api/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "重設失敗");
      }
    },
    onSuccess: () => {
      setResetTarget(null);
      setResetPassword("");
      setResetError(null);
      toast({ title: "密碼已重設", description: "使用者下次登入時需強制變更密碼" });
    },
    onError: (err) => setResetError(err instanceof Error ? err.message : "重設失敗"),
  });

  function openEdit(u: UserItem) {
    setEditTarget(u);
    setEditForm({ displayName: u.displayName, username: u.username, role: u.role as UserRole, isActive: u.isActive });
    setEditError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">用戶管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理系統使用者帳號與角色權限</p>
        </div>
        <Button onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(null); setCreateOpen(true); }}>
          <UserPlus className="mr-2 h-4 w-4" />
          新增使用者
        </Button>
      </div>

      {/* ── Role permission summary ── */}
      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">角色權限說明</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 text-xs">
          {[
            { role: "owner", desc: "所有功能完整存取" },
            { role: "admin", desc: "客戶、報價、派工、保固、收款（不含用戶管理）" },
            { role: "sales", desc: "客戶管理、報價單（不可刪除）" },
            { role: "engineer", desc: "派工單、進度、保養（不含財務）" },
            { role: "technician", desc: "派工單、保養（不含報價/收款/財務）" },
            { role: "accountant", desc: "應收帳款、收款、客戶（唯讀）" },
            { role: "distributor", desc: "僅限自己的報價單/訂單" },
          ].map(({ role, desc }) => (
            <div key={role} className="flex items-start gap-1.5">
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[role]}`}>
                {ROLE_LABELS[role as UserRole]}
              </span>
              <span className="text-muted-foreground leading-tight">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Users table ── */}
      <div className="rounded-md border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">尚無使用者</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>帳號</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>建立日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = me?.id === u.id;
                return (
                  <TableRow key={u.id} className={!u.isActive ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      {u.displayName}
                      {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(我)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">{u.username}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                        {ROLE_LABELS[u.role as UserRole] ?? u.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                          <UserCheck className="h-3 w-3" />啟用中
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border rounded px-1.5 py-0.5">
                          <UserX className="h-3 w-3" />已停用
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.createdAt).toLocaleDateString("zh-TW")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="編輯">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setResetTarget(u); setResetPassword(""); setResetError(null); }}
                          title="重設密碼"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(u)}
                          disabled={isSelf}
                          title={isSelf ? "不能刪除自己" : "刪除"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增使用者</DialogTitle>
            <DialogDescription>建立新的系統使用者帳號，首次登入將強制變更密碼</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); setCreateError(null); createMutation.mutate(createForm); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="c-displayName">姓名</Label>
              <Input id="c-displayName" value={createForm.displayName}
                onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                placeholder="請輸入姓名" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-username">帳號</Label>
              <Input id="c-username" value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="登入用帳號" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-password">密碼</Label>
              <Input id="c-password" type="password" value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="至少 6 位" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-role">角色</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v as UserRole })}>
                <SelectTrigger id="c-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{createError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />建立中...</> : "建立"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯使用者</DialogTitle>
            <DialogDescription>修改 {editTarget?.displayName} 的帳號資訊</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEditError(null);
              if (editTarget) editMutation.mutate({ id: editTarget.id, body: editForm });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="e-displayName">姓名</Label>
              <Input id="e-displayName" value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-username">帳號</Label>
              <Input id="e-username" value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-role">角色</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as UserRole })}>
                <SelectTrigger id="e-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-status">狀態</Label>
              <Select
                value={editForm.isActive ? "active" : "disabled"}
                onValueChange={(v) => setEditForm({ ...editForm, isActive: v === "active" })}
              >
                <SelectTrigger id="e-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">啟用中</SelectItem>
                  <SelectItem value="disabled">已停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{editError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />儲存中...</> : "儲存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reset password dialog ── */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重設密碼</DialogTitle>
            <DialogDescription>
              為 <strong>{resetTarget?.displayName}</strong> 設定新密碼，使用者下次登入時將強制變更密碼。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setResetError(null);
              if (resetTarget) resetMutation.mutate({ id: resetTarget.id, newPassword: resetPassword });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="r-password">新密碼</Label>
              <Input id="r-password" type="password" value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="至少 6 位" required minLength={6} />
            </div>
            {resetError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{resetError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>取消</Button>
              <Button type="submit" disabled={resetMutation.isPending}>
                {resetMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />重設中...</> : "確認重設"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除使用者</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除 <strong>{deleteTarget?.displayName}</strong>（{deleteTarget?.username}）的帳號。
              此操作無法復原，請確認後繼續。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />刪除中...</> : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
