import type { FbKind } from "@/lib/facebook-policy";

export interface FbPage {
  id: string;
  name: string;
  picture: string | null;
  category: string | null;
  fanCount: number;
  followers: number;
  tasks: string[];
}

export interface FbStatus {
  configured: boolean;
  redirectUri: string;
  connected: boolean;
  user: { id: string; name: string } | null;
  pages: FbPage[];
  activePageId: string | null;
  grantedScopes: string[];
  missingScopes: string[];
  reconnectRequired: boolean;
  earningsSyncedAt: string | null;
  tokenExpiresAt?: string | null;
}

export interface FbPost {
  id: string;
  pageId: string;
  pageName: string;
  kind: FbKind;
  status: "draft" | "scheduled" | "published" | "failed";
  message: string;
  mediaName: string | null;
  mediaBytes: number | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  facebookPostId: string | null;
  permalink: string | null;
  policyScore: number;
  policyGrade: string;
  policyFindings: { id: string; level: string; area: string; message: string }[];
  notes: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FbEarning {
  id: string;
  pageId: string;
  periodStart: string;
  periodEnd: string;
  metric: string;
  source: string;
  amount: string;
  currency: string;
  note: string;
  createdAt: string;
}

export interface FbEarningsResponse {
  entries: FbEarning[];
  summary: {
    total: string;
    byMonth: { month: string; amount: string }[];
    bySource: { source: string; amount: string }[];
  };
  syncedAt: string | null;
}

export interface FbOverview {
  page: { id: string; name: string; fanCount: number; followers: number };
  tasks: string[];
  canPublish: boolean;
  posts: { id: string; message: string; createdAt: string; permalink: string | null; shares: number; likes: number; comments: number }[];
}
