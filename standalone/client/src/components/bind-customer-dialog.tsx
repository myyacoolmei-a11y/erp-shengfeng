import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";

export type BindCustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Prefill snapshot display (name/phone/address) */
  initial?: Partial<CustomerSelectorValue> | null;
  confirmLabel?: string;
  onConfirm: (customer: CustomerSelectorValue) => void | Promise<void>;
  pending?: boolean;
};

/**
 * Modal to search/create and bind a formal customer.
 * Used when quote lacks customer_id or WO needs bind before AR.
 */
export function BindCustomerDialog({
  open,
  onOpenChange,
  title = "綁定客戶",
  description,
  initial,
  confirmLabel = "確認綁定",
  onConfirm,
  pending = false,
}: BindCustomerDialogProps) {
  const [value, setValue] = useState<CustomerSelectorValue | null>(null);

  // Reset when opening
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setValue(
        initial?.name
          ? {
              type: "temp",
              customerId: null,
              name: initial.name ?? "",
              contactPerson: initial.contactPerson ?? "",
              phone: initial.phone ?? "",
              mobile: initial.mobile ?? "",
              address: initial.address ?? "",
              taxId: initial.taxId ?? "",
            }
          : null,
      );
    }
    onOpenChange(o);
  };

  const canConfirm = !!(value?.type === "linked" && value.customerId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody className="space-y-3">
          <CustomerSelector
            value={value?.type === "linked" ? value : null}
            onChange={setValue}
            modal={false}
            allowTemp={false}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!canConfirm || pending}
            onClick={() => {
              if (value?.type === "linked" && value.customerId) void onConfirm(value);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
