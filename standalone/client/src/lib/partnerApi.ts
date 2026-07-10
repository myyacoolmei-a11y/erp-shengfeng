import { customFetch } from "../../../shared/api-client/custom-fetch.ts";

export interface PartnerHomeDto {
  dailyQuote: string;
  announcement: string;
  applause: string;
  updatedAt: {
    dailyQuote: string | null;
    announcement: string | null;
    applause: string | null;
  };
}

export interface PartnerSuggestionDto {
  id: number;
  content: string;
  isAnonymous: boolean;
  authorDisplayName: string | null;
  createdAt: string;
}

export type PartnerContentKey = "daily_quote" | "announcement" | "applause";

export async function getPartnerHome(): Promise<PartnerHomeDto> {
  return customFetch("/api/partner/home");
}

export async function updatePartnerContent(key: PartnerContentKey, content: string): Promise<PartnerHomeDto> {
  return customFetch("/api/partner/content", {
    method: "PATCH",
    body: JSON.stringify({ key, content }),
  });
}

export async function submitPartnerSuggestion(content: string, isAnonymous: boolean): Promise<{ ok: boolean }> {
  return customFetch("/api/partner/suggestions", {
    method: "POST",
    body: JSON.stringify({ content, isAnonymous }),
  });
}

export async function listPartnerSuggestions(): Promise<PartnerSuggestionDto[]> {
  return customFetch("/api/partner/suggestions");
}
