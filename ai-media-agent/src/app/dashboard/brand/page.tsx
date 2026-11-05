import { Palette } from "lucide-react";
import { ComingSoonPanel } from "@/components/dashboard/ComingSoonPanel";

export default function BrandSettingsPage() {
  return (
    <ComingSoonPanel
      icon={Palette}
      title="品牌設定"
      description="設定品牌識別色、語氣與 Logo，將在下一階段開放。"
    />
  );
}
