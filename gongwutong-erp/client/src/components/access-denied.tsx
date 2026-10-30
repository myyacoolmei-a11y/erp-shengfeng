import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth, defaultPathForRole } from "@/contexts/auth-context";

export function AccessDenied() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const home = user ? defaultPathForRole(user) : "/login";

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
        <ShieldX className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">你沒有此功能權限</h2>
        <p className="text-sm text-muted-foreground">請聯絡管理員開通對應功能後再試</p>
      </div>
      <Button variant="outline" onClick={() => navigate(home)}>
        返回首頁
      </Button>
    </div>
  );
}
