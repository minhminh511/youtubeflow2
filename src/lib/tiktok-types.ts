import type { TkPrivacy } from "@/lib/tiktok-policy";
import type { EnvironmentGuidance, TikTokDiagnosis } from "@/lib/tiktok-config";

export interface TkAccount {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileDeepLink: string | null;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

export interface TkStatus {
  configured: boolean;
  redirectUri: string;
  connected: boolean;
  account: TkAccount | null;
  grantedScopes: string[];
  missingScopes: string[];
  reconnectRequired: boolean;
  canPublish: boolean;
  canUpload: boolean;
  privacyOptions: string[];
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
  diagnostics?: TikTokDiagnosis;
  environment?: EnvironmentGuidance;
  request?: { endpoint: string; clientKeyMasked: string; scopes: string[]; redirectUri: string; responseType: string };
  extraScopes?: string[];
}

export interface TkVideo {
  id: string;
  title: string;
  cover: string | null;
  duration: number | null;
  createTime: string | null;
  shareUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
}

export interface TkCreatorInfo {
  nickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

export interface TkOverview {
  creator: TkCreatorInfo | null;
  videos: TkVideo[];
  scopes: string[];
}

export interface TkPost {
  id: string;
  mode: "direct" | "inbox";
  status: "draft" | "submitted" | "processing" | "reviewing" | "published" | "failed";
  title: string;
  privacyLevel: TkPrivacy;
  mediaName: string | null;
  mediaBytes: number | null;
  mediaDuration: number | null;
  publishId: string | null;
  videoId: string | null;
  policyScore: number;
  policyGrade: string;
  policyFindings: { id: string; level: string; area: string; message: string }[];
  notes: string;
  error: string | null;
  createdAt: string;
}
