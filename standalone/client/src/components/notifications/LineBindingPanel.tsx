import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Link2,
  CheckCircle2,
  Users,
  Unlink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, hasRole } from "@/contexts/auth-context";
import {
  getReceivableReminderSettings,
  generateLineBindingCode,
  getLineBindingStatus,
  listLineBindingOverview,
  unbindLineSubscription,
  adminRegenerateLineBindingCode,
} from "@/lib/reminderSettingsApi";

const SETTINGS_KEY = ["receivable-reminder-settings"];
const BINDING_STATUS_KEY = ["receivable-line-binding-status"];
const LINE_SUBSCRIPTIONS_KEY = ["line-subscriptions"];
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 10 * 60 * 1000;

function isDesktopBrowser(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "載入失敗";
}

export function LineBindingPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const pollStartedAtRef = useRef<number | null>(null);
  const isAdmin = hasRole(user, "super_admin", "owner", "admin");

  const [lineLinkError, setLineLinkError] = useState<string | null>(null);
  const [lineLinkLoading, setLineLinkLoading] = useState(false);
  const [bindingInstruction, setBindingInstruction] = useState<string | null>(null);
  const [bindingCode, setBindingCode] = useState<string | null>(null);
  const [addFriendUrl, setAddFriendUrl] = useState<string | null>(null);
  const [isPollingBinding, setIsPollingBinding] = useState(false);
  const [bindingComplete, setBindingComplete] = useState(false);

  const { data: adminSettings } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getReceivableReminderSettings,
    enabled: isAdmin,
    retry: false,
  });

  const { data: bindingStatus, isLoading: bindingLoading, isError: bindingError, error: bindingErrorObj } = useQuery({
    queryKey: BINDING_STATUS_KEY,
    queryFn: getLineBindingStatus,
    retry: 1,
    refetchInterval: query => {
      const status = query.state.data?.status;
      if (status === "bound") return false;
      if (isPollingBinding) {
        if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > POLL_MAX_MS) {
          return false;
        }
        return POLL_INTERVAL_MS;
      }
      if (status === "pending") return POLL_INTERVAL_MS;
      return false;
    },
  });

  const lineLinked = bindingStatus?.status === "bound" || bindingComplete || Boolean(adminSettings?.lineLinked);

  const { data: lineBindingOverview = [], isLoading: overviewLoading, isError: overviewError, error: overviewErrorObj } = useQuery({
    queryKey: LINE_SUBSCRIPTIONS_KEY,
    queryFn: listLineBindingOverview,
    enabled: isAdmin,
    retry: false,
  });

  const boundSubscriberCount = lineBindingOverview.filter(row => row.bindingStatus === "bound").length;

  useEffect(() => {
    if (!bindingStatus) return;
    if (bindingStatus.status === "bound") {
      setBindingComplete(true);
      setBindingInstruction(null);
      setBindingCode(null);
      setIsPollingBinding(false);
      return;
    }
    if (bindingStatus.status === "pending" && bindingStatus.code) {
      setBindingCode(bindingStatus.code);
      setBindingInstruction(`請先加入「晟風小秘書」好友，然後在 LINE 對話輸入：綁定 ${bindingStatus.code}`);
      if (bindingStatus.addFriendUrl) {
        setAddFriendUrl(bindingStatus.addFriendUrl);
      }
    }
  }, [bindingStatus]);

  useEffect(() => {
    if (bindingStatus?.status === "bound") {
      if (isAdmin) {
        qc.invalidateQueries({ queryKey: SETTINGS_KEY });
        qc.invalidateQueries({ queryKey: LINE_SUBSCRIPTIONS_KEY });
      }
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
    }
  }, [bindingStatus?.status, qc, isAdmin]);

  async function handleLineLinkClick() {
    setLineLinkError(null);
    setLineLinkLoading(true);
    setBindingComplete(false);

    try {
      const result = await generateLineBindingCode();
      setBindingCode(result.code);
      setBindingInstruction(result.instruction);
      setAddFriendUrl(result.addFriendUrl);
      pollStartedAtRef.current = Date.now();
      setIsPollingBinding(true);
      qc.invalidateQueries({ queryKey: BINDING_STATUS_KEY });
      if (isAdmin) {
        qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      }

      if (isDesktopBrowser()) {
        window.open(result.addFriendUrl, "_blank", "noopener,noreferrer");
      } else {
        const opened = window.open(result.addFriendUrl, "_blank");
        if (!opened) {
          window.location.href = result.addFriendUrl;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "無法取得 LINE 連結，請稍後再試";
      setLineLinkError(message);
    } finally {
      setLineLinkLoading(false);
    }
  }

  const unbindMutation = useMutation({
    mutationFn: unbindLineSubscription,
    onSuccess: (_data, userId) => {
      if (userId === user?.id) {
        setBindingComplete(false);
      }
      qc.invalidateQueries({ queryKey: LINE_SUBSCRIPTIONS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: BINDING_STATUS_KEY });
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast({ title: "已解除 LINE 綁定" });
    },
    onError: (err: Error) => {
      toast({ title: "解除綁定失敗", description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: adminRegenerateLineBindingCode,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: LINE_SUBSCRIPTIONS_KEY });
      toast({
        title: "已重新產生綁定碼",
        description: `${result.instruction}（10 分鐘內有效）`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "產生綁定碼失敗", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      {bindingError && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">
            無法載入 LINE 綁定狀態：{errorMessage(bindingErrorObj)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>LINE Messaging API</CardTitle>
          <CardDescription>
            Token 與 Secret 請在 Railway 環境變數設定。加入好友後，請在 LINE 對話輸入綁定碼完成連結。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bindingLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />載入 LINE 綁定狀態…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant={bindingStatus?.hasLineEnvConfig ?? adminSettings?.hasLineEnvConfig ? "default" : "destructive"}>
                  {bindingStatus?.hasLineEnvConfig ?? adminSettings?.hasLineEnvConfig ? "LINE 環境變數已設定" : "LINE 環境變數未設定"}
                </Badge>
                {lineLinked ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    我的 LINE 已連結
                    {bindingStatus?.linkedErpUserName ? `：${bindingStatus.linkedErpUserName}` : ""}
                    {bindingStatus?.lineUserIdMasked ? ` (${bindingStatus.lineUserIdMasked})` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline">尚未連結 LINE</Badge>
                )}
                {isAdmin && boundSubscriberCount > 0 && (
                  <Badge variant="secondary">
                    <Users className="h-3 w-3 mr-1" />
                    共 {boundSubscriberCount} 人已綁定
                  </Badge>
                )}
                {isPollingBinding && bindingStatus?.status === "pending" && (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">等待 LINE 輸入綁定碼…</Badge>
                )}
              </div>

              {isAdmin && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                  <p><span className="font-medium">Webhook URL：</span>{adminSettings?.lineWebhookUrl ?? "—"}</p>
                  <p className="text-muted-foreground">請在 LINE Developers Console 貼上此 URL，並啟用 Message 事件</p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleLineLinkClick()}
                disabled={lineLinkLoading || lineLinked}
              >
                {lineLinkLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                立即綁定 LINE
              </Button>

              {lineLinkError && (
                <p className="text-sm text-destructive font-medium" role="alert">
                  {lineLinkError}
                </p>
              )}

              {bindingInstruction && bindingCode && !lineLinked && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-primary">{bindingInstruction}</p>
                  <p className="text-3xl font-bold tracking-widest font-mono">{bindingCode}</p>
                  <p className="text-xs text-muted-foreground">綁定碼 10 分鐘內有效，請在 LINE 對話輸入「綁定 {bindingCode}」（5~8 位數字）</p>
                </div>
              )}

              {addFriendUrl && isDesktopBrowser() && !lineLinked && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3 max-w-xs">
                  <p className="text-sm font-medium">用手機掃描 QR Code 加入「晟風小秘書」</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(addFriendUrl)}`}
                    alt="LINE 加好友 QR Code"
                    width={180}
                    height={180}
                    className="rounded-md border bg-white"
                  />
                  <a
                    href={addFriendUrl}
                    className="text-sm text-primary underline break-all"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    開啟 LINE 加好友頁面
                  </a>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                按此按鈕會產生一次性綁定碼（5~8 位）並開啟 LINE 官方帳號。加入好友後，請在 LINE 對話輸入「綁定 XXXXX」完成連結。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              LINE 綁定管理
            </CardTitle>
            <CardDescription>查看所有 ERP 使用者的 LINE 綁定狀態，可解除綁定或重新產生綁定碼。</CardDescription>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />載入綁定列表…
              </p>
            ) : overviewError ? (
              <p className="text-sm text-destructive">無法載入綁定列表：{errorMessage(overviewErrorObj)}</p>
            ) : lineBindingOverview.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無使用者資料</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>使用者</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>LINE / 綁定碼</TableHead>
                    <TableHead>推播項目</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineBindingOverview.map(row => {
                    const activePrefs = row.prefs
                      ? [
                          row.prefs.receiveMorningBriefing && "晨報",
                          row.prefs.receivePendingDispatch && "待派工",
                          row.prefs.receiveQuoteFollowUp && "報價",
                          row.prefs.receiveEveningReminder && "晚間",
                          row.prefs.receiveReceivableCollection && "收款",
                        ].filter(Boolean).join("、")
                      : "—";

                    const statusLabel =
                      row.bindingStatus === "bound"
                        ? "已綁定"
                        : row.bindingStatus === "pending"
                          ? "待綁定"
                          : "未綁定";

                    return (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <div className="font-medium">{row.displayName}</div>
                          <div className="text-xs text-muted-foreground">{row.username}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.bindingStatus === "bound" ? "default" : "outline"}
                            className={
                              row.bindingStatus === "pending"
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                : undefined
                            }
                          >
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.bindingStatus === "bound" && row.lineUserIdMasked}
                          {row.bindingStatus === "pending" && (
                            <div>
                              <div>{row.pendingCode}</div>
                              {row.pendingExpiresAt && (
                                <div className="text-muted-foreground font-sans">
                                  至 {new Date(row.pendingExpiresAt).toLocaleString("zh-TW")}
                                </div>
                              )}
                            </div>
                          )}
                          {row.bindingStatus === "none" && "—"}
                        </TableCell>
                        <TableCell className="text-sm">{activePrefs}</TableCell>
                        <TableCell className="text-right space-x-2">
                          {row.bindingStatus === "bound" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={unbindMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`確定要解除「${row.displayName}」的 LINE 綁定？`)) {
                                  unbindMutation.mutate(row.userId);
                                }
                              }}
                            >
                              <Unlink className="h-3 w-3 mr-1" />
                              解除綁定
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={regenerateMutation.isPending}
                              onClick={() => regenerateMutation.mutate(row.userId)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              重新產生綁定碼
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
