import type { Brand } from "@/types";
import type { ContentFormValues, ContentFormErrors } from "@/lib/validation/content-form";

interface ContentDetailsFormProps {
  values: ContentFormValues;
  errors: ContentFormErrors;
  brands: Brand[];
  onFieldChange: <TField extends keyof ContentFormValues>(
    field: TField,
    value: ContentFormValues[TField]
  ) => void;
}

const inputClassName =
  "w-full rounded-xl border border-warm-600/25 bg-ink-900/60 px-4 py-3 text-sm text-warm-100 outline-none transition-colors placeholder:text-warm-500 focus:border-champagne-400/60";

export function ContentDetailsForm({ values, errors, brands, onFieldChange }: ContentDetailsFormProps) {
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-warm-200">
          內容名稱 <span className="text-blush-400">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={values.title}
          onChange={(event) => onFieldChange("title", event.target.value)}
          placeholder="例如：秋季新品上市宣傳片"
          className={inputClassName}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "title-error" : undefined}
        />
        {errors.title ? (
          <p id="title-error" className="mt-1.5 text-xs text-blush-400">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-warm-200">
          補充說明
        </label>
        <textarea
          id="description"
          rows={3}
          value={values.description}
          onChange={(event) => onFieldChange("description", event.target.value)}
          placeholder="簡述這份素材的背景或用途"
          className={`${inputClassName} resize-none`}
        />
      </div>

      <div>
        <label htmlFor="brand" className="mb-1.5 block text-sm font-medium text-warm-200">
          品牌
        </label>
        <select
          id="brand"
          value={values.brandId}
          onChange={(event) => onFieldChange("brandId", event.target.value)}
          className={`${inputClassName} appearance-none`}
        >
          <option value="">未指定品牌</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="highlights" className="mb-1.5 block text-sm font-medium text-warm-200">
          想強調的重點
        </label>
        <textarea
          id="highlights"
          rows={3}
          value={values.highlights}
          onChange={(event) => onFieldChange("highlights", event.target.value)}
          placeholder="例如：產品耐用度、限時優惠"
          className={`${inputClassName} resize-none`}
        />
      </div>
    </div>
  );
}
