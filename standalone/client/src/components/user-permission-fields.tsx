import type { FeatureKey, DataPermission, IdentityType, PermissionTemplateKey } from "../../../shared/userPermissions.ts";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  IDENTITY_TYPES,
  IDENTITY_TYPE_LABELS,
  DATA_PERMISSIONS,
  DATA_PERMISSION_LABELS,
  PERMISSION_TEMPLATE_KEYS,
  PERMISSION_TEMPLATE_LABELS,
  PERMISSION_TEMPLATES,
} from "../../../shared/userPermissions.ts";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface UserFormState {
  displayName: string;
  username: string;
  password: string;
  phone: string;
  email: string;
  identityType: IdentityType;
  title: string;
  notes: string;
  linkedEmployeeId: number | null;
  featurePermissions: FeatureKey[];
  dataPermission: DataPermission;
  permissionTemplate: PermissionTemplateKey | "";
  isActive: boolean;
  receiveDispatchNotifications: boolean;
}

export function applyPermissionTemplate(
  templateKey: PermissionTemplateKey,
  prev: UserFormState,
): UserFormState {
  const tpl = PERMISSION_TEMPLATES[templateKey];
  return {
    ...prev,
    permissionTemplate: templateKey,
    identityType: tpl.identityType,
    title: tpl.title,
    featurePermissions: [...tpl.features],
    dataPermission: tpl.dataPermission,
  };
}

export function FeaturePermissionCheckboxes({
  selected,
  onChange,
}: {
  selected: FeatureKey[];
  onChange: (features: FeatureKey[]) => void;
}) {
  function toggle(feature: FeatureKey, checked: boolean) {
    if (checked) onChange([...selected, feature]);
    else onChange(selected.filter(f => f !== feature));
  }

  return (
    <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto bg-muted/20">
      {FEATURE_KEYS.map(key => (
        <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={e => toggle(key, e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          {FEATURE_LABELS[key]}
        </label>
      ))}
    </div>
  );
}

export function UserProfileFields({
  form,
  setForm,
  employees,
  showPassword,
}: {
  form: UserFormState;
  setForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  employees: Array<{ id: number; name: string; status: string }>;
  showPassword?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>姓名 *</Label>
          <Input
            value={form.displayName}
            onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
            placeholder="顯示名稱"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>登入帳號 *</Label>
          <Input
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder="登入用帳號"
            required
          />
        </div>
        {showPassword && (
          <div className="space-y-2 sm:col-span-2">
            <Label>密碼 *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="至少 6 位"
              minLength={6}
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>手機</Label>
          <Input
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="09xx xxx xxx"
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="name@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>身分類型</Label>
          <Select
            value={form.identityType}
            onValueChange={v => setForm(f => ({ ...f, identityType: v as IdentityType }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {IDENTITY_TYPES.map(t => (
                <SelectItem key={t} value={t}>{IDENTITY_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>職稱或角色</Label>
          <Input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="例：工程師、會計"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>關聯員工（選填）</Label>
          <Select
            value={form.linkedEmployeeId != null ? String(form.linkedEmployeeId) : "none"}
            onValueChange={v => setForm(f => ({
              ...f,
              linkedEmployeeId: v === "none" ? null : Number(v),
            }))}
          >
            <SelectTrigger><SelectValue placeholder="不關聯" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不關聯正式員工</SelectItem>
              {employees
                .filter(e => e.status === "在職" || e.status === "配合")
                .map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">若此用戶同時是正式員工，可連結人事資料；不必先建立員工也能建立用戶。</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>備註</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="其他說明"
          />
        </div>
      </div>
    </div>
  );
}

export function UserPermissionFields({
  form,
  setForm,
}: {
  form: UserFormState;
  setForm: React.Dispatch<React.SetStateAction<UserFormState>>;
}) {
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-2">
        <Label>權限模板（快速套用）</Label>
        <Select
          value={form.permissionTemplate || "none"}
          onValueChange={v => {
            if (v === "none") {
              setForm(f => ({ ...f, permissionTemplate: "" }));
              return;
            }
            setForm(f => applyPermissionTemplate(v as PermissionTemplateKey, f));
          }}
        >
          <SelectTrigger><SelectValue placeholder="選擇模板" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">自訂（不套用模板）</SelectItem>
            {PERMISSION_TEMPLATE_KEYS.map(k => (
              <SelectItem key={k} value={k}>{PERMISSION_TEMPLATE_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>功能權限 *</Label>
        <FeaturePermissionCheckboxes
          selected={form.featurePermissions}
          onChange={features => setForm(f => ({ ...f, featurePermissions: features, permissionTemplate: "" }))}
        />
      </div>

      <div className="space-y-2">
        <Label>資料權限</Label>
        <div className="space-y-2">
          {DATA_PERMISSIONS.map(dp => (
            <label key={dp} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="dataPermission"
                checked={form.dataPermission === dp}
                onChange={() => setForm(f => ({ ...f, dataPermission: dp }))}
                className="accent-primary"
              />
              {DATA_PERMISSION_LABELS[dp]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
        <div>
          <p className="text-sm font-medium">接收派工進度通知</p>
          <p className="text-xs text-muted-foreground">工程師出發／到達／完工／無法施工時推播與站內通知</p>
        </div>
        <Switch
          checked={form.receiveDispatchNotifications}
          onCheckedChange={v => setForm(f => ({ ...f, receiveDispatchNotifications: v }))}
        />
      </div>
    </div>
  );
}
