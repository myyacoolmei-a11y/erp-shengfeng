import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListEmployees } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Pencil, Trash2, KeyRound, Loader2, UserCheck, UserX, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  IDENTITY_TYPE_LABELS,
  FEATURE_LABELS,
  DATA_PERMISSION_LABELS,
  PERMISSION_TEMPLATES,
  inferRolesFromFeatures,
  type FeatureKey,
  type DataPermission,
  type IdentityType,
  type PermissionTemplateKey,
} from "../../../shared/userPermissions.ts";
import {
  UserProfileFields,
  UserPermissionFields,
  applyPermissionTemplate,
  type UserFormState,
} from "@/components/user-permission-fields";

interface UserItem {
  id: number;
  username: string;
  displayName: string;
  role: string;
  roles: string[];
  phone: string | null;
  email: string | null;
  identityType: string;
  title: string | null;
  notes: string | null;
  featurePermissions: FeatureKey[];
  dataPermission: DataPermission;
  linkedEmployeeId: number | null;
  receiveDispatchNotifications: boolean;
  isActive: boolean;
  createdAt: string;
}

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

function defaultCreateForm(): UserFormState {
  const tpl = applyPermissionTemplate("engineer", {
    displayName: "",
    username: "",
    password: "",
    phone: "",
    email: "",
    identityType: "employee",
    title: "",
    notes: "",
    linkedEmployeeId: null,
    featurePermissions: [],
    dataPermission: "all",
    permissionTemplate: "",
    isActive: true,
    receiveDispatchNotifications: true,
  });
  return tpl;
}

function userToForm(u: UserItem): UserFormState {
  return {
    displayName: u.displayName,
    username: u.username,
    password: "",
    phone: u.phone ?? "",
    email: u.email ?? "",
    identityType: (u.identityType as IdentityType) ?? "employee",
    title: u.title ?? "",
    notes: u.notes ?? "",
    linkedEmployeeId: u.linkedEmployeeId,
    featurePermissions: u.featurePermissions ?? [],
    dataPermission: u.dataPermission ?? "all",
    permissionTemplate: "",
    isActive: u.isActive,
    receiveDispatchNotifications: u.receiveDispatchNotifications ?? true,
  };
}

function buildApiBody(form: UserFormState, isCreate: boolean) {
  const tplKey = form.permissionTemplate as PermissionTemplateKey | "";
  const roles = tplKey && PERMISSION_TEMPLATES[tplKey]
    ? [...PERMISSION_TEMPLATES[tplKey].roles]
    : inferRolesFromFeatures(form.featurePermissions);

  const body: Record<string, unknown> = {
    displayName: form.displayName,
    username: form.username,
    phone: form.phone || undefined,
    email: form.email || undefined,
    identityType: form.identityType,
    title: form.title || undefined,
    notes: form.notes || undefined,
    linkedEmployeeId: form.linkedEmployeeId,
    featurePermissions: form.featurePermissions,
    dataPermission: form.dataPermission,
    permissionTemplate: tplKey || undefined,
    roles,
    receiveDispatchNotifications: form.receiveDispatchNotifications,
  };

  if (isCreate) body.password = form.password;
  else body.isActive = form.isActive;

  return body;
}

export default function UsersPage() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const { data: employees = [] } = useListEmployees();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormState>(defaultCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(defaultCreateForm());
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
    mutationFn: async (form: UserFormState) => {
      const res = await authFetch("/api/users", {
        method: "POST",
        body: JSON.stringify(buildApiBody(form, true)),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "建立失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setCreateForm(defaultCreateForm());
      setCreateError(null);
      toast({ title: "用戶已建立", description: "首次登入需強制變更密碼" });
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : "建立失敗"),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, form }: { id: number; form: UserFormState }) => {
      const res = await authFetch(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(buildApiBody(form, false)),
      });
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
      toast({ title: "用戶已更新" });
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
      toast({ title: "用戶已刪除" });
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
      toast({ title: "密碼已重設", description: "用戶下次登入時需強制變更密碼" });
    },
    onError: (err) => setResetError(err instanceof Error ? err.message : "重設失敗"),
  });

  function openEdit(u: UserItem) {
    setEditTarget(u);
    setEditForm(userToForm(u));
    setEditError(null);
  }

  function validateForm(form: UserFormState): string | null {
    if (!form.displayName.trim()) return "請填寫姓名";
    if (!form.username.trim()) return "請填寫登入帳號";
    if (form.featurePermissions.length === 0) return "至少選擇一項功能權限";
    return null;
  }

  const employeeNameById = (id: number | null) => {
    if (!id) return null;
    return employees.find(e => e.id === id)?.name ?? `#${id}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">用戶管理</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            管理所有可登入 ERP 的帳號與權限。用戶不一定是正式員工，也可能是老闆、外包、會計或臨時人員。
            正式員工的人事資料請至「員工管理」維護。
          </p>
        </div>
        <Button onClick={() => { setCreateForm(defaultCreateForm()); setCreateError(null); setCreateOpen(true); }}>
          <UserPlus className="mr-2 h-4 w-4" />
          新增用戶
        </Button>
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">與員工管理的差異</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li><strong>員工管理</strong>：公司正式員工的人事資料（職位、績效、在職狀態），不含登入帳號。</li>
          <li><strong>用戶管理</strong>：登入帳號、功能權限、資料權限；可選擇關聯正式員工。</li>
        </ul>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">尚無用戶</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>帳號</TableHead>
                <TableHead>身分</TableHead>
                <TableHead>職稱</TableHead>
                <TableHead>功能權限</TableHead>
                <TableHead>資料權限</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => {
                const isSelf = me?.id === u.id;
                const isTargetSuperAdmin = (u.roles?.length ? u.roles : [u.role]).includes("super_admin");

                return (
                  <TableRow key={u.id} className={!u.isActive ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      {u.displayName}
                      {isSelf && <span className="ml-1 text-xs text-muted-foreground">(我)</span>}
                      {u.linkedEmployeeId && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          關聯：{employeeNameById(u.linkedEmployeeId)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{u.username}</TableCell>
                    <TableCell className="text-sm">
                      {IDENTITY_TYPE_LABELS[u.identityType as IdentityType] ?? u.identityType}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.title || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(u.featurePermissions ?? []).slice(0, 4).map(f => (
                          <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-800 border border-green-200">
                            {FEATURE_LABELS[f]}
                          </span>
                        ))}
                        {(u.featurePermissions?.length ?? 0) > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{u.featurePermissions!.length - 4}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {DATA_PERMISSION_LABELS[u.dataPermission] ?? u.dataPermission}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                          <UserCheck className="h-3 w-3" />啟用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border rounded px-1.5 py-0.5">
                          <UserX className="h-3 w-3" />停用
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isTargetSuperAdmin && !isSelf ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldAlert className="h-3.5 w-3.5" />受保護
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="編輯">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!isTargetSuperAdmin && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => { setResetTarget(u); setResetPassword(""); setResetError(null); }} title="重設密碼">
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                              {!isSelf && (
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)} title="刪除">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增用戶</DialogTitle>
            <DialogDescription>建立登入帳號並設定功能與資料權限，不必先建立員工資料。</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!createForm.password || createForm.password.length < 6) {
                setCreateError("密碼至少 6 位");
                return;
              }
              const err = validateForm(createForm);
              if (err) { setCreateError(err); return; }
              setCreateError(null);
              createMutation.mutate(createForm);
            }}
            className="space-y-4"
          >
            <UserProfileFields form={createForm} setForm={setCreateForm} employees={employees} showPassword />
            <UserPermissionFields form={createForm} setForm={setCreateForm} />
            {createError && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                建立
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯用戶</DialogTitle>
            <DialogDescription>{editTarget?.displayName}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              const err = validateForm(editForm);
              if (err) { setEditError(err); return; }
              setEditError(null);
              if (editTarget) editMutation.mutate({ id: editTarget.id, form: editForm });
            }}
            className="space-y-4"
          >
            <UserProfileFields form={editForm} setForm={setEditForm} employees={employees} />
            {editTarget && !(editTarget.roles?.length ? editTarget.roles : [editTarget.role]).includes("super_admin") ? (
              <>
                <UserPermissionFields form={editForm} setForm={setEditForm} />
                <div className="space-y-2">
                  <Label>帳號狀態</Label>
                  <Select
                    value={editForm.isActive ? "active" : "disabled"}
                    onValueChange={v => setEditForm(f => ({ ...f, isActive: v === "active" }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">啟用</SelectItem>
                      <SelectItem value="disabled">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2 border rounded-md p-3">
                <ShieldAlert className="h-4 w-4" />
                系統管理員僅可修改基本資料，權限不可變更。
              </p>
            )}
            {editError && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
              <Button type="submit" disabled={editMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={o => { if (!o) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重設密碼</DialogTitle>
            <DialogDescription>為 {resetTarget?.displayName} 設定新密碼</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (resetTarget) resetMutation.mutate({ id: resetTarget.id, newPassword: resetPassword });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>新密碼</Label>
              <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} minLength={6} required />
            </div>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>取消</Button>
              <Button type="submit" disabled={resetMutation.isPending}>確認重設</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除用戶</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除 {deleteTarget?.displayName}（{deleteTarget?.username}）的登入帳號，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
