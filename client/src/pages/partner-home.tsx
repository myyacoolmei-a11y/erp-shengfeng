import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Heart, Sparkles, Wrench } from "lucide-react";

const PARTNER_HOME_KEY = ["partner-home"];

const DAILY_QUOTES = [
  "今天也要平平安安、順順利利地完成每一項任務。",
  "專業來自細節，用心成就每一次服務。",
  "每一步都踏實走，每一單都認真做。",
  "安全是第一原則，效率是最佳夥伴。",
  "遇到困難不慌張，團隊永遠在你身邊。",
  "把客戶的事當自己的事，就是最好的口碑。",
  "出發前多檢查一次，完工後多一份安心。",
  "今天的汗水，是明天最好的成長。",
  "誠信做事、誠懇待人，晟風因你而驕傲。",
  "再忙也別忘了照顧好自己，身體是最重要的工具。",
  "小事做好，大事自然順利。",
  "每一次出工都是展現專業的機會。",
  "保持微笑，讓客戶感受到晟風的溫度。",
  "團隊合作，沒有解決不了的問題。",
  "學習新技能，讓自己每天都更進步。",
  "準時出發、準時回報，是對夥伴最大的尊重。",
  "認真對待每一台設備，就是對安全最大的負責。",
  "今天的努力，客戶看得見、公司記得住。",
  "遇到挑戰是成長的開始，加油！",
  "把工作做漂亮，把心情也照顧好。",
  "晟風的品質，來自每一位夥伴的堅持。",
  "出門前確認工具齊全，回來後記得好好休息。",
  "你的專業與態度，是晟風最好的名片。",
  "今天也是值得驕傲的一天，繼續向前！",
];

function getDailyQuote(): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) | 0;
  }
  return DAILY_QUOTES[Math.abs(hash) % DAILY_QUOTES.length];
}

function PartnerCard({
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
    <Card className={`rounded-2xl border shadow-sm ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-xl" aria-hidden>{emoji}</span>
          <h2 className="font-bold text-base text-[#1B4332]">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function PartnerHome() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const dailyQuote = getDailyQuote();

  return (
    <div className="max-w-lg mx-auto md:max-w-xl space-y-5 pb-10 px-1">
      <div className="rounded-2xl bg-gradient-to-br from-[#F2FFE8] via-white to-[#F8FFF2] border border-[#B9F66B] p-6">
        <div className="flex items-center gap-2 text-[#2D6A4F] mb-2">
          <Heart className="h-5 w-5 text-[#40916C]" />
          <span className="text-sm font-semibold">❤️ 晟風夥伴</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1B4332]">
          {user?.displayName ? `${user.displayName}，你好` : "夥伴，你好"}
        </h1>
        <p className="text-sm text-[#40916C] mt-1.5">{todayLabel}</p>
      </div>

      <Button
        asChild
        className="w-full h-[60px] rounded-2xl bg-[#B8FF63] hover:bg-[#A8EF53] text-black font-bold text-lg shadow-md border-0"
      >
        <Link href="/engineer-dashboard">
          <Wrench className="h-5 w-5 mr-2" />
          查看今日派工
        </Link>
      </Button>

      {isLoading ? (
        <div className="space-y-5">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <PartnerCard
            emoji="🌞"
            title="今日一句"
            className="bg-white border-[#B9F66B]/60"
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#1B4332]">
              {dailyQuote}
            </p>
          </PartnerCard>

          <PartnerCard
            emoji="📢"
            title="公司公告"
            className="bg-[#F2FFE8] border-[#B9F66B]"
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#1B4332]">
              {data?.announcement || "目前沒有新公告。"}
            </p>
          </PartnerCard>

          <PartnerCard
            emoji="🏢"
            title="公司介紹"
            className="bg-white border-[#B9F66B]/50"
          >
            <p className="text-sm leading-relaxed text-[#1B4332]">
              晟風工程秉持專業、誠信、安全、效率，感謝每位夥伴的付出，一起打造最值得信賴的工程團隊。
            </p>
          </PartnerCard>

          <PartnerCard
            emoji="👏"
            title="今日掌聲"
            className="bg-[#F8FFF2] border-[#B9F66B]/40"
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#1B4332]">
              {data?.applause || "感謝每一位夥伴的付出！"}
            </p>
          </PartnerCard>

          <PartnerCard
            emoji="💡"
            title="我有建議"
            className="bg-white border-[#B9F66B]/50"
          >
            <p className="text-sm text-[#40916C] mb-4 leading-relaxed">
              有好想法或想反映的問題？歡迎告訴我們，也可以選擇匿名送出。
            </p>
            <Button
              className="w-full h-12 rounded-2xl bg-[#F2FFE8] hover:bg-[#E8FFD8] border border-[#B9F66B] text-black font-semibold shadow-sm"
              onClick={() => setSuggestOpen(true)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              送出建議
            </Button>
          </PartnerCard>
        </>
      )}

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-md rounded-2xl">
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
            <div className="flex items-center justify-between rounded-2xl border border-[#B9F66B]/50 p-4 bg-[#F8FFF2]">
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
              className="bg-[#B8FF63] hover:bg-[#A8EF53] text-black font-semibold"
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
