import { Settings } from "lucide-react";
import { ComingSoonPanel } from "@/components/dashboard/ComingSoonPanel";

export default function AccountSettingsPage() {
  return (
    <ComingSoonPanel
      icon={Settings}
      title="帳號設定"
      description="管理個人資料與帳號安全設定，將在下一階段開放。"
    />
  );
}
