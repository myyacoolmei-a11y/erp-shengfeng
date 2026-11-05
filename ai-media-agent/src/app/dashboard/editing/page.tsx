import { Clapperboard } from "lucide-react";
import { ComingSoonPanel } from "@/components/dashboard/ComingSoonPanel";

export default function AiEditingPage() {
  return (
    <ComingSoonPanel
      icon={Clapperboard}
      title="AI 剪輯"
      description="檢視 AI 產生的剪輯提案並進行調整，將在下一階段開放。"
    />
  );
}
