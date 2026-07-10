import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getPartnerHome, submitPartnerSuggestion } from "@/lib/partnerApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { MessageCircleHeart, Sparkles } from "lucide-react";

const PARTNER_HOME_KEY = ["partner-home"];

function WarmCard({
  emoji,
  title,
  children,
  className = "",
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`border-0 shadow-sm ${className}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl" aria-hidden>{emoji}</span>
          <h2 className="font-semibold text-base">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function PartnerHome() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: PARTNER_HOME_KEY,
    queryFn: getPartnerHome,
  });

  const suggestMutation = useMutation({
    mutationFn: () => submitPartnerSuggestion(suggestText, anonymous),
    onSuccess: () => {
      setSuggestOpen(false);
      setSuggestText("");
      setAnonymous(false);
      toast({ title: "感謝你的建議！", description: "我們會認真閱讀每一則回饋。" });
    },
    onError: (err: Error) => {
      toast({ title: "送出失敗", description: err.message, variant: "destructive" });
    },
  });

  const todayLabel = new Date().toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="max-w-lg mx-auto md:max-w-xl space-y-5 pb-8">
      <div className="rounded-2xl bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 border border-rose-100/80 p-5">
        <div className="flex items-center gap-2 text-rose-600 mb-1">
          <MessageCircleHeart className="h-5 w-5" />
          <span className="text-sm font-medium">❤️ 晟風夥伴</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          {user?.displayName ? `${user.displayName}，你好` : "夥伴，你好"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{todayLabel}</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <WarmCard emoji="🌞" title="今日一句" className="bg-amber-50/80">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {data?.dailyQuote || "今天也要平平安安、順順利利。"}
            </p>
          </WarmCard>

          <WarmCard emoji="📢" title="公司公告" className="bg-sky-50/60">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {data?.announcement || "目前沒有新公告。"}
            </p>
          </WarmCard>

          <WarmCard emoji="👏" title="今日掌聲" className="bg-rose-50/70">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {data?.applause || "感謝每一位夥伴的付出！"}
            </p>
          </WarmCard>

          <WarmCard emoji="💡" title="我有建議" className="bg-violet-50/50">
            <p className="text-sm text-muted-foreground mb-3">
              有好想法或想反映的問題？歡迎告訴我們，也可以選擇匿名送出。
            </p>
            <Button
              variant="outline"
              className="w-full border-violet-200 hover:bg-violet-100/50"
              onClick={() => setSuggestOpen(true)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              送出建議
            </Button>
          </WarmCard>
        </>
      )}

      <p className="text-center text-xs text-muted-foreground pt-2">
        <Link href="/engineer-dashboard" className="underline hover:text-foreground">
          查看今日派工
        </Link>
      </p>

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>💡 我有建議</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suggest">建議內容</Label>
              <Textarea
                id="suggest"
                rows={5}
                placeholder="請描述你的想法或建議…"
                value={suggestText}
                onChange={e => setSuggestText(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">匿名送出</p>
                <p className="text-xs text-muted-foreground">管理員不會看到你的名字</p>
              </div>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestOpen(false)}>取消</Button>
            <Button
              disabled={!suggestText.trim() || suggestMutation.isPending}
              onClick={() => suggestMutation.mutate()}
            >
              送出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
