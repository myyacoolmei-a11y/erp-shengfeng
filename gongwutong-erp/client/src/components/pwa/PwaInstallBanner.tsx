import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { APP_BRAND } from "@/lib/appBrand";

interface Props {
  className?: string;
  compact?: boolean;
}

export function PwaInstallBanner({ className = "", compact = false }: Props) {
  const {
    showBanner,
    canPromptInstall,
    canShowIosHint,
    installing,
    install,
    dismiss,
  } = usePwaInstall();

  if (!showBanner) return null;

  return (
    <div
      className={`rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 sm:px-4 ${className}`}
      role="region"
      aria-label="安裝 App 提示"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              安裝「{APP_BRAND.pwaShortName}」到主畫面
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {canShowIosHint ? (
                <>
                  在 iPhone 請點選 Safari 下方
                  <Share className="inline h-3.5 w-3.5 mx-0.5 align-text-bottom" />
                  「分享」→「加入主畫面」，即可像 App 一樣快速開啟 {APP_BRAND.pwaName}。
                </>
              ) : (
                <>安裝後可從主畫面獨立開啟，更適合工地現場使用。</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPromptInstall && (
              <Button
                type="button"
                size={compact ? "sm" : "default"}
                className="h-9"
                disabled={installing}
                onClick={() => void install()}
              >
                {installing ? "安裝中…" : "安裝 App"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size={compact ? "sm" : "default"}
              className="h-9 text-muted-foreground"
              onClick={dismiss}
            >
              稍後再說
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label="關閉"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
