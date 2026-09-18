import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Save } from "lucide-react";
import {
  getPartnerHome,
  updatePartnerContent,
  type PartnerContentKey,
} from "@/lib/partnerApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { APP_BRAND } from "@/lib/appBrand";

const PARTNER_HOME_KEY = ["partner-home"];

const CONTENT_BLOCKS: Array<{
  key: PartnerContentKey;
  emoji: string;
  title: string;
  hint: string;
  field: "dailyQuote" | "announcement" | "applause";
}> = [
  { key: "daily_quote", emoji: "🌞", title: "今日一句", hint: "鼓勵或提醒工程師的一句話", field: "dailyQuote" },
  { key: "announcement", emoji: "📢", title: "公司公告", hint: "最新一則公司公告", field: "announcement" },
  { key: "applause", emoji: "👏", title: "今日掌聲", hint: "感謝或表揚某位夥伴", field: "applause" },
];

export default function PartnerCulturePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: PARTNER_HOME_KEY, queryFn: getPartnerHome });

  const [drafts, setDrafts] = useState({ dailyQuote: "", announcement: "", applause: "" });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `晟風夥伴文化 — ${APP_BRAND.pwaName}`;
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (!data) return;
    setDrafts({
      dailyQuote: data.dailyQuote,
      announcement: data.announcement,
      applause: data.applause,
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: ({ key, content }: { key: PartnerContentKey; content: string }) =>
      updatePartnerContent(key, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PARTNER_HOME_KEY });
      toast({ title: "已儲存" });
    },
    onError: (err: Error) => {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Heart className="h-6 w-6 text-rose-500" />
          晟風夥伴文化
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          編輯工程師首頁的今日一句、公司公告與今日掌聲。
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4">
          {CONTENT_BLOCKS.map(block => (
            <Card key={block.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{block.emoji}</span>
                  {block.title}
                </CardTitle>
                <CardDescription>{block.hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>{block.title}內容</Label>
                  <Textarea
                    rows={3}
                    value={drafts[block.field]}
                    onChange={e => setDrafts(d => ({ ...d, [block.field]: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={saveMutation.isPending || !drafts[block.field].trim()}
                  onClick={() => saveMutation.mutate({ key: block.key, content: drafts[block.field] })}
                >
                  <Save className="h-4 w-4 mr-1" />
                  儲存{block.title}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
