import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCcw } from "lucide-react";
import {
  CONTINUOUS_PAPER,
  PRINT_CALIBRATION_DEFAULT,
  loadPrintCalibration,
  savePrintCalibration,
  resetPrintCalibration,
} from "@/lib/printPaperConfig";

interface PrintCalibrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 派工單列印校正設定 — 調整連續報表紙的上下／左右列印位置偏移量。
 * 校正值只影響「正式列印」時的視覺位置（透過 CSS padding 偏移，不用 transform），
 * 不會變更派工單資料或畫面顯示內容；儲存於瀏覽器 localStorage，
 * 重新整理頁面後仍會保留。
 */
export function PrintCalibrationDialog({ open, onOpenChange }: PrintCalibrationDialogProps) {
  const [xInput, setXInput] = useState(String(PRINT_CALIBRATION_DEFAULT.offsetXMm));
  const [yInput, setYInput] = useState(String(PRINT_CALIBRATION_DEFAULT.offsetYMm));

  useEffect(() => {
    if (!open) return;
    const cal = loadPrintCalibration();
    setXInput(String(cal.offsetXMm));
    setYInput(String(cal.offsetYMm));
  }, [open]);

  function handleSave() {
    const offsetXMm = parseFloat(xInput);
    const offsetYMm = parseFloat(yInput);
    savePrintCalibration({
      offsetXMm: Number.isFinite(offsetXMm) ? offsetXMm : 0,
      offsetYMm: Number.isFinite(offsetYMm) ? offsetYMm : 0,
    });
    onOpenChange(false);
  }

  function handleReset() {
    const def = resetPrintCalibration();
    setXInput(String(def.offsetXMm));
    setYInput(String(def.offsetYMm));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>派工單列印校正</DialogTitle>
          <DialogDescription>
            調整連續報表紙（{CONTINUOUS_PAPER.WIDTH_MM}×{CONTINUOUS_PAPER.HEIGHT_MM}mm）在點陣印表機上的列印位置偏移量。
            此設定只影響「正式列印」時的位置，不會變更派工單內容或畫面資料。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>左右偏移（mm）</Label>
            <Input
              type="number"
              step="0.5"
              value={xInput}
              onChange={e => setXInput(e.target.value)}
              placeholder="正數向右，負數向左"
            />
          </div>
          <div className="space-y-1">
            <Label>上下偏移（mm）</Label>
            <Input
              type="number"
              step="0.5"
              value={yInput}
              onChange={e => setYInput(e.target.value)}
              placeholder="正數向下，負數向上"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          建議先在連續報表紙上試印一張，比對欄位與送紙孔／撕線的相對位置後再微調數值，
          並重新列印確認。
        </p>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />恢復預設值
          </Button>
          <Button type="button" onClick={handleSave}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
