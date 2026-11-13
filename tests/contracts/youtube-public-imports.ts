/**
 * Compile-time regression for the imports used by youtube-public.ts.
 * Included by the root tsconfig, so both `tsc --noEmit` and `next build` check it.
 * Not imported by the app and has no top-level database/network side effects.
 */
import {
  publicChannels,
  studioVideos,
  type PublicChannelInsert,
  type PublicChannelRow,
} from "@/db/schema";
import { mapVideo, type GoogleVideo } from "@/lib/youtube";

export function publicSyncImportContract(channel: PublicChannelRow, video: GoogleVideo) {
  const channelValues: PublicChannelInsert = {
    workspaceId: channel.workspaceId,
    handle: channel.handle,
    channelId: channel.channelId,
    title: channel.title,
    description: channel.description,
    thumbnail: channel.thumbnail,
    subscribers: channel.subscribers,
    views: channel.views,
    videoCount: channel.videoCount,
    uploadsPlaylistId: channel.uploadsPlaylistId,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  };

  const videoValues: typeof studioVideos.$inferInsert = {
    workspaceId: channel.workspaceId,
    ...mapVideo(video),
  };

  return { table: publicChannels, channelValues, videoValues };
}
