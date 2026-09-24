import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type WholesaleCustomerOption = {
  id: number;
  companyName: string;
  taxId?: string | null;
  contactPerson?: string | null;
};

export function CustomerSearchSelect({
  customers,
  value,
  onChange,
  placeholder = "搜尋並選擇批發客戶",
}: {
  customers: WholesaleCustomerOption[];
  value: number | null;
  onChange: (customer: WholesaleCustomerOption | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) ?? null;
  const label = selected
    ? `${selected.companyName}${selected.taxId ? `（${selected.taxId}）` : ""}`
    : placeholder;

  const items = useMemo(() => customers, [customers]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[280px]" align="start">
        <Command>
          <CommandInput placeholder="搜尋客戶公司名稱、統編、聯絡人" />
          <CommandList>
            <CommandEmpty>找不到批發客戶</CommandEmpty>
            <CommandGroup>
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.companyName} ${c.taxId ?? ""} ${c.contactPerson ?? ""}`}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{c.companyName}</span>
                  {c.taxId ? <span className="ml-2 text-xs text-muted-foreground">{c.taxId}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
