import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthRange, shiftMonth } from "../../../../shared/wholesaleAccount.ts";

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (next: string) => void;
}) {
  const label = monthRange(month).label;
  return (
    <div className="flex items-center gap-1 border rounded-md px-1">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="px-2 text-sm font-medium tabular-nums min-w-[8.5rem] text-center">{label}</span>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
