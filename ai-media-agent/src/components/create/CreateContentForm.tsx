"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Brand, EditStyle } from "@/types";
import { MediaSourceTabs, type CreateMediaSource } from "@/components/create/MediaSourceTabs";
import { FileDropzone } from "@/components/create/FileDropzone";
import { AudioRecorder } from "@/components/create/AudioRecorder";
import { ContentDetailsForm } from "@/components/create/ContentDetailsForm";
import { StyleSelector } from "@/components/create/StyleSelector";
import {
  validateContentForm,
  type ContentFormErrors,
  type ContentFormValues,
} from "@/lib/validation/content-form";
import { submitContent, type ContentSubmissionAction } from "@/lib/create-content";

interface CreateContentFormProps {
  brands: Brand[];
  initialSource: CreateMediaSource;
}

interface SubmitState {
  status: "idle" | "loading" | "success" | "error";
  action: ContentSubmissionAction | null;
  message: string | null;
}

const INITIAL_VALUES: ContentFormValues = {
  title: "",
  description: "",
  brandId: "",
  highlights: "",
  style: "auto",
};

export function CreateContentForm({ brands, initialSource }: CreateContentFormProps) {
  const [source, setSource] = useState<CreateMediaSource>(initialSource);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [values, setValues] = useState<ContentFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<ContentFormErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    action: null,
    message: null,
  });

  function handleSourceChange(nextSource: CreateMediaSource) {
    setSource(nextSource);
    setMediaFile(null);
    setErrors((previous) => ({ ...previous, mediaSource: undefined }));
  }

  function handleFieldChange<TField extends keyof ContentFormValues>(
    field: TField,
    value: ContentFormValues[TField]
  ) {
    setValues((previous) => ({ ...previous, [field]: value }));
    if (field === "title") {
      setErrors((previous) => ({ ...previous, title: undefined }));
    }
  }

  function handleStyleChange(style: EditStyle) {
    setValues((previous) => ({ ...previous, style }));
  }

  async function handleSubmit(action: ContentSubmissionAction) {
    const requireMedia = action === "process";
    const nextErrors = validateContentForm(values, {
      requireMedia,
      hasMediaFile: mediaFile !== null,
      mediaType: source,
    });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitState({ status: "loading", action, message: null });

    try {
      await submitContent(
        { ...values, mediaSource: source, fileName: mediaFile?.name ?? null },
        action
      );

      setSubmitState({
        status: "success",
        action,
        message:
          action === "draft"
            ? "草稿已儲存，您可以稍後回來繼續編輯。"
            : "已送出給 AI 處理，完成後會顯示在內容中心。",
      });
    } catch {
      setSubmitState({
        status: "error",
        action,
        message: "送出失敗，請稍後再試一次。",
      });
    }
  }

  const isLoading = submitState.status === "loading";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-warm-300">選擇素材類型</h2>
        <MediaSourceTabs value={source} onChange={handleSourceChange} />

        <div className="mt-4">
          {source === "video" ? (
            <FileDropzone
              accept="video/*"
              hint="支援 MP4、MOV 等影片格式"
              file={mediaFile}
              onFileSelected={setMediaFile}
            />
          ) : null}
          {source === "image" ? (
            <FileDropzone
              accept="image/*"
              hint="支援 JPG、PNG 等圖片格式"
              file={mediaFile}
              onFileSelected={setMediaFile}
            />
          ) : null}
          {source === "audio" ? <AudioRecorder file={mediaFile} onFileSelected={setMediaFile} /> : null}
        </div>

        {errors.mediaSource ? (
          <p className="mt-2 text-xs text-blush-400">{errors.mediaSource}</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-warm-300">內容資訊</h2>
        <ContentDetailsForm
          values={values}
          errors={errors}
          brands={brands}
          onFieldChange={handleFieldChange}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-warm-300">影片風格</h2>
        <StyleSelector value={values.style} onChange={handleStyleChange} />
      </section>

      {submitState.message ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            submitState.status === "error"
              ? "border-blush-500/30 bg-blush-500/10 text-blush-300"
              : "border-champagne-400/30 bg-champagne-500/10 text-champagne-300"
          }`}
        >
          {submitState.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleSubmit("draft")}
          className="flex items-center justify-center gap-2 rounded-full border border-warm-600/30 px-6 py-3 text-sm font-semibold text-warm-200 transition-colors hover:border-champagne-400/50 hover:text-champagne-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading && submitState.action === "draft" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          儲存草稿
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleSubmit("process")}
          className="flex items-center justify-center gap-2 rounded-full bg-champagne-500 px-6 py-3 text-sm font-semibold text-ink-950 transition-colors hover:bg-champagne-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading && submitState.action === "process" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          讓 AI 開始處理
        </button>
      </div>
    </div>
  );
}
