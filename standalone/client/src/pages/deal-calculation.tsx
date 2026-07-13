import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  Calculator,
  Loader2,
  Save,
  FileText,
  Sparkles,
  Gift,
  Copy,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { APP_BRAND } from "@/lib/appBrand";
import {
  calculateBuyerDeal,
  calculateSellerDeal,
  saveDealCalculation,
  type BuyerCalcInput,
  type SellerCalcInput,
  type BuyerCalcResult,
  type SellerCalcResult,
  type GovernmentBenefitMatch,
  type AiExplanationResult,
} from "@/lib/dealCalcApi";
import { buildDealCalcHtml } from "@/components/pdf/templates/DealCalcTemplate";
import { handlePdfAction } from "@/components/pdf/pdf-service";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { downloadPdf } from "@/components/pdf/pdf-service";

type CalcTab = "buyer" | "seller";
type DownPaymentMode = "amount" | "ratio";

const UNIVERSAL_BENEFIT_DISCLAIMER =
  "實際資格、利率、額度及期限，以主管機關與承貸銀行最新審核結果為準。";

function fmtMoney(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
}

function statusBadgeVariant(status: GovernmentBenefitMatch["status"]) {
  if (status === "likely") return "default";
  if (status === "needs_confirmation") return "secondary";
  return "outline";
}

function MoneyRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-1 ${highlight ? "font-semibold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{typeof value === "number" ? fmtMoney(value) : value}</span>
    </div>
  );
}

function BenefitsPanel({ benefits, onRefresh, loading }: {
  benefits: GovernmentBenefitMatch[];
  onRefresh?: () => void;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            政府優惠
          </CardTitle>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "查看政府優惠"}
            </Button>
          )}
        </div>
        <CardDescription>{UNIVERSAL_BENEFIT_DISCLAIMER}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {benefits.length === 0 ? (
          <p className="text-sm text-muted-foreground">完成試算後，點選「查看政府優惠」比對可能適用項目。</p>
        ) : (
          benefits.map(b => (
            <div key={b.code} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm">{b.name}</span>
                <Badge variant={statusBadgeVariant(b.status)}>{b.statusLabel}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{b.mainConditions}</p>
              {b.missingData.length > 0 && (
                <p className="text-xs text-amber-700">尚需確認：{b.missingData.join("、")}</p>
              )}
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <a href={b.sourceUrl} target="_blank" rel="noreferrer" className="underline">官方資料來源</a>
                <span>最後更新：{b.lastUpdated}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AiExplanationPanel({ ai, calcType }: {
  ai: AiExplanationResult | null;
  calcType: CalcTab;
}) {
  const [view, setView] = useState<"simple" | "professional" | "line">("simple");
  const { toast } = useToast();

  if (!ai) return null;

  const text = view === "simple" ? ai.simple : view === "professional" ? ai.professional : ai.lineReply;

  async function copyText() {
    await navigator.clipboard.writeText(text);
    toast({ title: "已複製到剪貼簿" });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI 解說
        </CardTitle>
        <CardDescription>供現場說明與 LINE 回覆參考，不保證核貸或優惠資格。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={view} onValueChange={v => setView(v as typeof view)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="simple" className="text-xs">簡單版</TabsTrigger>
            <TabsTrigger value="professional" className="text-xs">專業版</TabsTrigger>
            <TabsTrigger value="line" className="text-xs">LINE 回覆版</TabsTrigger>
          </TabsList>
        </Tabs>
        <Textarea readOnly value={text} rows={10} className="text-sm font-mono" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyText}>
            <Copy className="h-3.5 w-3.5 mr-1" />複製
          </Button>
          <Button variant="outline" size="sm" disabled title="預留：送至 AI LINE 助理">
            <MessageCircle className="h-3.5 w-3.5 mr-1" />送至 LINE 助理（預留）
          </Button>
        </div>
        {ai.disclaimers.map((d, i) => (
          <p key={i} className="text-[11px] text-muted-foreground">※ {d}</p>
        ))}
        <p className="text-xs text-muted-foreground">
          {calcType === "buyer" ? "下一步建議已包含於解說內容。" : "售屋試算請向地政士確認過戶與稅費細節。"}
        </p>
      </CardContent>
    </Card>
  );
}

export default function DealCalculationPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const customerIdParam = params.get("customerId");
  const customerId = customerIdParam ? Number(customerIdParam) : undefined;
  const customerNameParam = params.get("customerName") ?? "";

  const [tab, setTab] = useState<CalcTab>("buyer");
  const [customerName, setCustomerName] = useState(customerNameParam);
  const [downPaymentMode, setDownPaymentMode] = useState<DownPaymentMode>("ratio");

  const [buyerInput, setBuyerInput] = useState({
    propertyPrice: 12000000,
    downPaymentAmount: 2400000,
    loanRatioPercent: 80,
    annualInterestRate: 2.1,
    loanTermYears: 30 as 20 | 30 | 40,
    isFirstHome: true,
    isSelfOccupied: true,
    hasOtherMortgage: false,
  });

  const [sellerInput, setSellerInput] = useState({
    purchasePrice: 8000000,
    salePrice: 12000000,
    holdingYears: 5,
    isSelfOccupied: true,
    loanBalance: 3000000,
    agentFee: 240000,
    notaryFee: 15000,
  });

  const [buyerResult, setBuyerResult] = useState<BuyerCalcResult | null>(null);
  const [sellerResult, setSellerResult] = useState<SellerCalcResult | null>(null);
  const [benefits, setBenefits] = useState<GovernmentBenefitMatch[]>([]);
  const [aiExplanation, setAiExplanation] = useState<AiExplanationResult | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

  useEffect(() => {
    if (customerNameParam) setCustomerName(customerNameParam);
  }, [customerNameParam]);

  const agentContact = useMemo(() => ({
    name: user?.displayName ?? APP_BRAND.pwaShortName,
    phone: "",
    company: APP_BRAND.nameZh,
  }), [user]);

  const buyerCalcMutation = useMutation({
    mutationFn: async () => {
      const payload: BuyerCalcInput = {
        propertyPrice: buyerInput.propertyPrice,
        annualInterestRate: buyerInput.annualInterestRate,
        loanTermYears: buyerInput.loanTermYears,
        isFirstHome: buyerInput.isFirstHome,
        isSelfOccupied: buyerInput.isSelfOccupied,
        hasOtherMortgage: buyerInput.hasOtherMortgage,
        customerName: customerName || undefined,
        customerId: Number.isFinite(customerId) ? customerId : undefined,
        ...(downPaymentMode === "amount"
          ? { downPaymentAmount: buyerInput.downPaymentAmount }
          : { loanRatioPercent: buyerInput.loanRatioPercent }),
      };
      return calculateBuyerDeal(payload);
    },
    onSuccess: data => {
      setBuyerResult(data.result);
      setBenefits(data.benefits);
      setAiExplanation(data.aiExplanation);
      toast({ title: "購屋試算完成" });
    },
    onError: (e: Error) => toast({ title: "試算失敗", description: e.message, variant: "destructive" }),
  });

  const sellerCalcMutation = useMutation({
    mutationFn: async () => {
      const payload: SellerCalcInput = {
        ...sellerInput,
        customerName: customerName || undefined,
        customerId: Number.isFinite(customerId) ? customerId : undefined,
      };
      return calculateSellerDeal(payload);
    },
    onSuccess: data => {
      setSellerResult(data.result);
      setBenefits([]);
      setAiExplanation(data.aiExplanation);
      toast({ title: "售屋試算完成" });
    },
    onError: (e: Error) => toast({ title: "試算失敗", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const calcType = tab;
      const input = calcType === "buyer"
        ? {
            ...buyerInput,
            ...(downPaymentMode === "amount"
              ? { downPaymentAmount: buyerInput.downPaymentAmount }
              : { loanRatioPercent: buyerInput.loanRatioPercent }),
          }
        : sellerInput;
      const result = calcType === "buyer" ? buyerResult : sellerResult;
      if (!result) throw new Error("請先完成試算");

      return saveDealCalculation({
        calcType,
        customerId: Number.isFinite(customerId) ? customerId : null,
        customerName: customerName || null,
        input: input as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        benefits: calcType === "buyer" ? benefits : [],
        aiExplanation,
        agentContact,
        createFollowUpTask: !!customerId,
      });
    },
    onSuccess: () => {
      toast({
        title: "試算已儲存",
        description: customerId ? "已寫入客戶時間軸並建立追蹤任務。" : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "儲存失敗", description: e.message, variant: "destructive" }),
  });

  async function handlePdf(action: "preview" | "download" | "share") {
    const calcType = tab;
    const result = calcType === "buyer" ? buyerResult : sellerResult;
    if (!result) {
      toast({ title: "請先完成試算", variant: "destructive" });
      return;
    }
    const html = buildDealCalcHtml({
      calcType,
      customerName,
      result,
      benefits: calcType === "buyer" ? benefits : [],
      aiExplanation,
      agentContact,
    });
    const filename = `${calcType === "buyer" ? "購屋" : "售屋"}試算書_${customerName || "客戶"}_${new Date().toISOString().slice(0, 10)}.pdf`;
    await handlePdfAction({
      html,
      docNo: `DC-${Date.now()}`,
      filename,
      title: calcType === "buyer" ? "購屋試算書" : "售屋試算書",
      action,
      setPdfPreview,
      toast: (opts) => toast({ title: opts.title, description: opts.description, variant: opts.variant as "default" | "destructive" | undefined }),
    });
  }

  const estimateDisclaimer = tab === "buyer"
    ? buyerResult?.disclaimers[0]
    : sellerResult?.disclaimers[0];

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Calculator className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">AI 成交試算中心</h1>
          <p className="text-sm text-muted-foreground">
            輸入條件後立即整理購屋／售屋成本、政府優惠與 AI 解說，方便現場說明。
          </p>
        </div>
      </div>

      {customerId && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          已連結客戶 #{customerId}{customerName ? ` · ${customerName}` : ""}，儲存時將寫入時間軸。
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>客戶姓名</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="現場填寫或從客戶頁帶入" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={v => setTab(v as CalcTab)}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="buyer">買方試算</TabsTrigger>
          <TabsTrigger value="seller">賣方試算</TabsTrigger>
        </TabsList>

        <TabsContent value="buyer" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">輸入條件</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>房屋總價（元）</Label>
                  <Input type="number" value={buyerInput.propertyPrice}
                    onChange={e => setBuyerInput(p => ({ ...p, propertyPrice: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>頭期款 / 貸款成數</Label>
                  <Select value={downPaymentMode} onValueChange={v => setDownPaymentMode(v as DownPaymentMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ratio">以貸款成數計算</SelectItem>
                      <SelectItem value="amount">以頭期款金額計算</SelectItem>
                    </SelectContent>
                  </Select>
                  {downPaymentMode === "ratio" ? (
                    <Input type="number" value={buyerInput.loanRatioPercent}
                      onChange={e => setBuyerInput(p => ({ ...p, loanRatioPercent: Number(e.target.value) }))}
                      placeholder="貸款成數 %" />
                  ) : (
                    <Input type="number" value={buyerInput.downPaymentAmount}
                      onChange={e => setBuyerInput(p => ({ ...p, downPaymentAmount: Number(e.target.value) }))}
                      placeholder="頭期款金額" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>利率（%）</Label>
                    <Input type="number" step="0.01" value={buyerInput.annualInterestRate}
                      onChange={e => setBuyerInput(p => ({ ...p, annualInterestRate: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>貸款年限</Label>
                    <Select value={String(buyerInput.loanTermYears)}
                      onValueChange={v => setBuyerInput(p => ({ ...p, loanTermYears: Number(v) as 20 | 30 | 40 }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20 年</SelectItem>
                        <SelectItem value="30">30 年</SelectItem>
                        <SelectItem value="40">40 年</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 pt-1">
                  {[
                    { key: "isFirstHome", label: "首購" },
                    { key: "isSelfOccupied", label: "自住" },
                    { key: "hasOtherMortgage", label: "已有其他房貸" },
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Switch
                        checked={buyerInput[item.key as keyof typeof buyerInput] as boolean}
                        onCheckedChange={v => setBuyerInput(p => ({ ...p, [item.key]: v }))}
                      />
                      <Label className="font-normal">{item.label}</Label>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => buyerCalcMutation.mutate()} disabled={buyerCalcMutation.isPending}>
                  {buyerCalcMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  開始試算
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">試算結果</CardTitle>
                {estimateDisclaimer && (
                  <CardDescription className="flex items-start gap-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {estimateDisclaimer}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {buyerResult ? (
                  <div className="divide-y">
                    <MoneyRow label="頭期款" value={buyerResult.downPayment} />
                    <MoneyRow label="貸款金額" value={buyerResult.loanAmount} />
                    <MoneyRow label="每月房貸" value={buyerResult.monthlyPayment} highlight />
                    <MoneyRow label="預估交易成本" value={buyerResult.transactionCosts.total} />
                    <MoneyRow label="仲介費（概算）" value={buyerResult.transactionCosts.agentFee} />
                    <MoneyRow label="代書費（概算）" value={buyerResult.transactionCosts.notaryFee} />
                    <MoneyRow label="建議準備現金" value={buyerResult.suggestedCash} highlight />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">填寫條件後按「開始試算」。</p>
                )}
              </CardContent>
            </Card>
          </div>

          <BenefitsPanel
            benefits={benefits}
            loading={buyerCalcMutation.isPending}
            onRefresh={() => buyerCalcMutation.mutate()}
          />
        </TabsContent>

        <TabsContent value="seller" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">輸入條件</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "purchasePrice", label: "購入價格（元）" },
                  { key: "salePrice", label: "出售價格（元）" },
                  { key: "holdingYears", label: "持有時間（年）" },
                  { key: "loanBalance", label: "貸款餘額（元）" },
                  { key: "agentFee", label: "仲介費（元）" },
                  { key: "notaryFee", label: "代書費（元）" },
                ].map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <Label>{f.label}</Label>
                    <Input type="number" value={sellerInput[f.key as keyof typeof sellerInput] as number}
                      onChange={e => setSellerInput(p => ({ ...p, [f.key]: Number(e.target.value) }))} />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Switch checked={sellerInput.isSelfOccupied}
                    onCheckedChange={v => setSellerInput(p => ({ ...p, isSelfOccupied: v }))} />
                  <Label className="font-normal">自住</Label>
                </div>
                <Button className="w-full" onClick={() => sellerCalcMutation.mutate()} disabled={sellerCalcMutation.isPending}>
                  {sellerCalcMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  開始試算
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">試算結果</CardTitle>
                {estimateDisclaimer && (
                  <CardDescription className="flex items-start gap-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {estimateDisclaimer}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {sellerResult ? (
                  <div className="divide-y">
                    <MoneyRow label="預估房地合一稅" value={sellerResult.estimatedCapitalGainsTax} />
                    <MoneyRow label="預估土地增值稅" value={sellerResult.estimatedLandValueIncrementTax} />
                    <MoneyRow label="交易費用" value={sellerResult.transactionFees} />
                    <MoneyRow label="仲介費" value={sellerResult.agentFee} />
                    <MoneyRow label="代書費" value={sellerResult.notaryFee} />
                    <MoneyRow label="貸款清償金額" value={sellerResult.loanPayoff} />
                    <MoneyRow label="預估實拿金額" value={sellerResult.estimatedNetProceeds} highlight />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">填寫條件後按「開始試算」。</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {aiExplanation && <AiExplanationPanel ai={aiExplanation} calcType={tab} />}

      {(buyerResult || sellerResult) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              PDF 試算書
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePdf("preview")}>
              預覽 PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => handlePdf("download")}>
              下載 PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => handlePdf("share")}>
              分享／LINE（預留）
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              儲存試算紀錄
            </Button>
          </CardContent>
        </Card>
      )}

      {pdfPreview && (
        <PdfPreviewDialog
          open
          onClose={() => {
            URL.revokeObjectURL(pdfPreview.url);
            setPdfPreview(null);
          }}
          pdfUrl={pdfPreview.url}
          filename={pdfPreview.filename}
          onDownload={() => {
            fetch(pdfPreview.url)
              .then(r => r.blob())
              .then(blob => downloadPdf(blob, pdfPreview.filename));
          }}
        />
      )}
    </div>
  );
}
