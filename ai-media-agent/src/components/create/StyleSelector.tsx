import type { EditStyle } from "@/types";
import { EDIT_STYLE_OPTIONS } from "@/lib/content-options";

interface StyleSelectorProps {
  value: EditStyle;
  onChange: (value: EditStyle) => void;
}

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div role="radiogroup" aria-label="影片風格" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {EDIT_STYLE_OPTIONS.map(({ value: optionValue, label, description }) => {
        const isActive = optionValue === value;

        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(optionValue)}
            className={`rounded-2xl border px-4 py-3.5 text-left transition-colors ${
              isActive
                ? "border-champagne-400/60 bg-champagne-500/10"
                : "border-warm-600/15 bg-ink-900/60 hover:border-warm-600/30"
            }`}
          >
            <p className={`text-sm font-medium ${isActive ? "text-champagne-300" : "text-warm-200"}`}>
              {label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-warm-500">{description}</p>
          </button>
        );
      })}
    </div>
  );
}
