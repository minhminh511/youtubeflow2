import { pgTable, pgEnum, uuid, text, varchar, timestamp, jsonb, date, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const planStatus = pgEnum("plan_status", ["idea", "planned", "published"]);
export const planFormat = pgEnum("plan_format", ["video", "short", "live"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionHash: text("session_hash").notNull().unique(),
  name: varchar("name", { length: 80 }).notNull().default("Không gian của tôi"),
  completedSteps: jsonb("completed_steps").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  format: planFormat("format").notNull().default("video"),
  status: planStatus("status").notNull().default("idea"),
  scheduledDate: date("scheduled_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const youtubeConnections = pgTable("youtube_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  subscribers: text("subscribers").notNull().default("0"),
  views: text("views").notNull().default("0"),
  videoCount: text("video_count").notNull().default("0"),
  encryptedTokens: text("encrypted_tokens").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Public channel cache, separate from OAuth connections.
 * One selected public channel per workspace; never stores access/refresh tokens.
 * Exported for server-side public synchronization modules such as youtube-public.ts.
 */
export const publicChannels = pgTable("public_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: "cascade" }),
  handle: text("handle").notNull(),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  thumbnail: text("thumbnail"),
  subscribers: text("subscribers").notNull().default("0"),
  views: text("views").notNull().default("0"),
  videoCount: text("video_count").notNull().default("0"),
  uploadsPlaylistId: text("uploads_playlist_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PublicChannelRow = typeof publicChannels.$inferSelect;
export type PublicChannelInsert = typeof publicChannels.$inferInsert;

/** One Facebook login per workspace; several Pages can be switched without reconnecting. Tokens are encrypted. */
export const facebookConnections = pgTable("facebook_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  encryptedTokens: text("encrypted_tokens").notNull(),
  pages: jsonb("pages").$type<{ id: string; name: string; picture: string | null; category: string | null; fanCount: number; followers: number; tasks: string[] }[]>().notNull().default([]),
  activePageId: text("active_page_id"),
  grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  earningsSyncedAt: timestamp("earnings_synced_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Facebook publishing history: drafts, scheduled, published and failed attempts with their policy report. */
export const facebookPosts = pgTable("facebook_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  pageId: text("page_id").notNull(),
  pageName: text("page_name").notNull().default(""),
  kind: text("kind").notNull().default("text"),
  status: text("status").notNull().default("draft"),
  message: text("message").notNull().default(""),
  mediaName: text("media_name"),
  mediaBytes: integer("media_bytes"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  facebookPostId: text("facebook_post_id"),
  permalink: text("permalink"),
  policyScore: integer("policy_score").notNull().default(100),
  policyGrade: text("policy_grade").notNull().default("A+"),
  policyFindings: jsonb("policy_findings").$type<{ id: string; level: string; area: string; message: string }[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monetization records per Page. Source tells whether the figure came from Meta, a CSV export or manual entry. */
export const facebookEarnings = pgTable("facebook_earnings", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  pageId: text("page_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  metric: text("metric").notNull().default("manual"),
  source: text("source").notNull().default("manual"),
  amount: text("amount").notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  note: text("note").notNull().default(""),
  externalKey: text("external_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("facebook_earnings_external_unique").on(table.workspaceId, table.externalKey)]);

/**
 * TikTok Login Kit connection. Access tokens last 24 hours and refresh tokens can rotate,
 * so both are stored encrypted and renewed server-side before every call.
 */
export const tiktokConnections = pgTable("tiktok_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: "cascade" }),
  openId: text("open_id").notNull(),
  username: text("username").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  profileDeepLink: text("profile_deep_link"),
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  likesCount: integer("likes_count").notNull().default(0),
  videoCount: integer("video_count").notNull().default(0),
  encryptedTokens: text("encrypted_tokens").notNull(),
  grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
  privacyOptions: jsonb("privacy_options").$type<string[]>().notNull().default([]),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** TikTok publishing history: drafts, submitted uploads and their status from the Content Posting API. */
export const tiktokPosts = pgTable("tiktok_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  openId: text("open_id").notNull().default(""),
  mode: text("mode").notNull().default("direct"),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull().default(""),
  privacyLevel: text("privacy_level").notNull().default("SELF_ONLY"),
  disableComment: boolean("disable_comment").notNull().default(false),
  disableDuet: boolean("disable_duet").notNull().default(false),
  disableStitch: boolean("disable_stitch").notNull().default(false),
  coverTimestampMs: integer("cover_timestamp_ms").notNull().default(1000),
  mediaName: text("media_name"),
  mediaBytes: integer("media_bytes"),
  mediaDuration: integer("media_duration"),
  publishId: text("publish_id"),
  videoId: text("video_id"),
  policyScore: integer("policy_score").notNull().default(100),
  policyGrade: text("policy_grade").notNull().default("A+"),
  policyFindings: jsonb("policy_findings").$type<{ id: string; level: string; area: string; message: string }[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studioVideos = pgTable("studio_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  thumbnail: text("thumbnail"),
  privacyStatus: text("privacy_status").notNull().default("public"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  duration: text("duration"),
  viewCount: text("view_count").notNull().default("0"),
  likeCount: text("like_count").notNull().default("0"),
  commentCount: text("comment_count").notNull().default("0"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  categoryId: text("category_id"),
  madeForKids: boolean("made_for_kids").notNull().default(false),
  localStatus: text("local_status").notNull().default("published"),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  localNotes: text("local_notes").notNull().default(""),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("studio_videos_workspace_video_unique").on(table.workspaceId, table.youtubeVideoId)]);

export const contentPillars = pgTable("content_pillars", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  handle: text("handle").notNull(),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  subscribers: text("subscribers").notNull().default("0"),
  views: text("views").notNull().default("0"),
  videoCount: text("video_count").notNull().default("0"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("competitors_workspace_channel_unique").on(table.workspaceId, table.channelId)]);

export const monetization = pgTable("monetization", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: "cascade" }),
  checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
  revenueGoal: text("revenue_goal").notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const revenueEntries = pgTable("revenue_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(),
  amount: text("amount").notNull().default("0"),
  source: text("source").notNull().default("Quảng cáo"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  privacyStatus: text("privacy_status").notNull().default("private"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  status: text("status").notNull().default("uploading"),
  youtubeVideoId: text("youtube_video_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
