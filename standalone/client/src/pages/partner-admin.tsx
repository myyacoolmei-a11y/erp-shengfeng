import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  getPartnerHome,
  updatePartnerContent,
  listPartnerSuggestions,
  type PartnerContentKey,
} from "@/lib/partnerApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Save, ArrowLeft, RefreshCw } from "lucide-react";

const PARTNER_HOME_KEY = ["partner-home"];
const PARTNER_SUGGESTIONS_KEY = ["partner-suggestions"];

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

export default function PartnerAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: PARTNER_HOME_KEY, queryFn: getPartnerHome });
  const { data: suggestions = [], isLoading: suggestionsLoading, refetch } = useQuery({
    queryKey: PARTNER_SUGGESTIONS_KEY,
    queryFn: listPartnerSuggestions,
  });

  const [drafts, setDrafts] = useState({ dailyQuote: "", announcement: "", applause: "" });

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
      <div className="flex items-center gap-3">
        <Link href="/reminder-settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回 AI 小秘書
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">晟風夥伴管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          編輯工程師首頁的今日一句、公司公告與今日掌聲，並查看夥伴建議。
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">💡 夥伴建議</CardTitle>
              <CardDescription>工程師／技師送出的建議（含匿名）</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              重新整理
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {suggestionsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無建議</p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map(s => (
                <li key={s.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{s.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {s.isAnonymous ? "匿名" : (s.authorDisplayName ?? "—")}
                    {" · "}
                    {new Date(s.createdAt).toLocaleString("zh-TW")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
