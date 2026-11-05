import { Layers } from "lucide-react";
import { ComingSoonPanel } from "@/components/dashboard/ComingSoonPanel";

export default function ContentCenterPage() {
  return (
    <ComingSoonPanel
      icon={Layers}
      title="內容中心"
      description="集中管理所有內容的完整功能，將在下一階段開放。"
    />
  );
}
