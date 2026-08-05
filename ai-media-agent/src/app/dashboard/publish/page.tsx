import { Send } from "lucide-react";
import { ComingSoonPanel } from "@/components/dashboard/ComingSoonPanel";

export default function PublishCenterPage() {
  return (
    <ComingSoonPanel
      icon={Send}
      title="發布中心"
      description="管理各平台的發布排程與紀錄，將在下一階段開放。"
    />
  );
}
