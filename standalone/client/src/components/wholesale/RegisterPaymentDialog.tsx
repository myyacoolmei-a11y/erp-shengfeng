import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WHOLESALE_PAYMENT_METHODS } from "../../../../shared/wholesaleAccount.ts";
import { allocateWholesalePayment, parseMoney } from "../../../../shared/wholesalePaymentMath.ts";
import {
  createWholesaleAccountPayment,
  errMessage,
  fetchUnpaidOrders,
  fmtDateSlash,
  fmtTwd,
  type CustomerMonthOrder,
} from "@/lib/wholesaleAccountApi";
import { useToast } from "@/hooks/use-toast";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function RegisterPaymentDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: number | null;
  customerName: string;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [method, setMethod] = useState("匯款");
  const [note, setNote] = useState("");
  const [allocMap, setAllocMap] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: unpaid = [], isLoading } = useQuery({
    queryKey: ["wholesale-unpaid-orders", customerId],
    queryFn: () => fetchUnpaidOrders(customerId!),
    enabled: open && customerId != null,
  });

  const outstanding = useMemo(
    () => unpaid.reduce((s, o) => s + o.remainingAmount, 0),
    [unpaid],
  );

  function applyFifo(pay: number, orders: CustomerMonthOrder[]) {
    if (!(pay > 0) || orders.length === 0) {
      setAllocMap({});
      return;
    }
    try {
      const rows = allocateWholesalePayment(
        pay,
        orders.map((o) => ({ orderId: o.orderId, remaining: o.remainingAmount })),
      );
      const next: Record<number, string> = {};
      for (const row of rows) next[row.orderId] = String(row.amount);
      setAllocMap(next);
    } catch {
      setAllocMap({});
    }
  }

  useEffect(() => {
    if (!open) return;
    setPaymentDate(todayStr());
    setMethod("匯款");
    setNote("");
    setAmount(outstanding > 0 ? String(Math.round(outstanding)) : "");
    applyFifo(outstanding, unpaid);
  }, [open, customerId, unpaid.length, outstanding]);

  const allocSum = Object.values(allocMap).reduce((s, v) => s + parseMoney(v), 0);
  const payAmount = parseMoney(amount);

  async function submit() {
    if (customerId == null) return;
    if (!(payAmount > 0)) {
      toast({ title: "請輸入收款金額", variant: "destructive" });
      return;
    }
    const allocations = unpaid
      .map((o) => ({ orderId: o.orderId, allocatedAmount: parseMoney(allocMap[o.orderId] ?? 0) }))
      .filter((a) => a.allocatedAmount > 0);
    if (allocations.length === 0) {
      toast({ title: "請至少分配一張出貨單", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createWholesaleAccountPayment({
        customerId,
        paymentDate,
        amount: payAmount,
        paymentMethod: method,
        note: note.trim() || undefined,
        allocations,
      });
      toast({ title: "已登記收款" });
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast({ title: errMessage(err, "登記收款失敗"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>登記收款 — {customerName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">載入未收出貨單…</p>
        ) : unpaid.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">此客戶目前沒有未收出貨單。</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>收款金額 *</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    applyFifo(parseMoney(e.target.value), unpaid);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>收款日期</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>收款方式</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WHOLESALE_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>未收合計</Label>
                <Input readOnly className="bg-muted" value={fmtTwd(outstanding)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">分配至出貨單</p>
                <Button type="button" variant="outline" size="sm" onClick={() => applyFifo(payAmount, unpaid)}>
                  依金額自動分配
                </Button>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="p-2 font-medium">日期</th>
                      <th className="p-2 font-medium">出貨單號</th>
                      <th className="p-2 font-medium text-right">未收</th>
                      <th className="p-2 font-medium text-right">本次分配</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaid.map((o) => (
                      <tr key={o.orderId} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{fmtDateSlash(o.orderDate)}</td>
                        <td className="p-2">{o.orderNumber ?? `#${o.orderId}`}</td>
                        <td className="p-2 text-right tabular-nums">{fmtTwd(o.remainingAmount)}</td>
                        <td className="p-2 text-right">
                          <Input
                            className="h-8 w-28 ml-auto text-right"
                            type="number"
                            min="0"
                            step="1"
                            value={allocMap[o.orderId] ?? ""}
                            onChange={(e) => setAllocMap((prev) => ({ ...prev, [o.orderId]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={Math.abs(allocSum - payAmount) > 0.009 ? "text-xs text-destructive mt-1" : "text-xs text-muted-foreground mt-1"}>
                分配合計 {fmtTwd(allocSum)}，必須等於收款金額 {fmtTwd(payAmount)}
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={saving || unpaid.length === 0 || Math.abs(allocSum - payAmount) > 0.009}>
            {saving ? "處理中…" : "確認收款"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
