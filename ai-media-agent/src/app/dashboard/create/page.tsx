import { CreateContentForm } from "@/components/create/CreateContentForm";
import type { CreateMediaSource } from "@/components/create/MediaSourceTabs";
import { getBrands } from "@/lib/data/mock-brands";

const VALID_SOURCES: CreateMediaSource[] = ["video", "image", "audio"];

function resolveInitialSource(source: string | undefined): CreateMediaSource {
  if (source && VALID_SOURCES.includes(source as CreateMediaSource)) {
    return source as CreateMediaSource;
  }
  return "video";
}

interface CreateContentPageProps {
  searchParams: Promise<{ source?: string }>;
}

export default async function CreateContentPage({ searchParams }: CreateContentPageProps) {
  const [{ source }, brands] = await Promise.all([searchParams, getBrands()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-warm-100 sm:text-2xl">新增內容</h1>
        <p className="mt-1 text-sm text-warm-500">
          上傳素材並填寫內容資訊，AI 會依此產生剪輯與文案提案
        </p>
      </div>

      <CreateContentForm brands={brands} initialSource={resolveInitialSource(source)} />
    </div>
  );
}
