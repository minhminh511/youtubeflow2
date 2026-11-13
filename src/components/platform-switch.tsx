"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Music4, Share2 } from "lucide-react";
import { fetchWithSession } from "@/lib/client";
import type { View } from "@/lib/types";

type Platform = "youtube" | "facebook" | "tiktok";
type FbStatus = { connected: boolean; reconnectRequired: boolean; activePageId: string | null; pages: { id: string; name: string }[] };
type TtStatus = { connected: boolean; reconnectRequired: boolean; account: { displayName: string; username: string } | null };

/**
 * Switch between the three publishing platforms. It always shows which side is active and whether
 * each side is connected, so moving content between them never happens blindly.
 */
export function PlatformSwitch({ current, onNavigate, youtubeConnected }: { current: Platform; onNavigate: (view: View) => void; youtubeConnected: boolean }) {
  const [facebook, setFacebook] = useState<FbStatus | null>(null);
  const [tiktok, setTikTok] = useState<TtStatus | null>(null);

  useEffect(() => {
    let active = true;
    const read = (url: string, apply: (data: unknown) => void) =>
      fetchWithSession<unknown>(url).then((data) => { if (data) apply(data); }).catch(() => undefined);
    void read("/api/facebook/status", (data) => { if (active) setFacebook(data as FbStatus); });
    void read("/api/tiktok/status", (data) => { if (active) setTikTok(data as TtStatus); });
    return () => { active = false; };
  }, []);

  const activePage = facebook?.pages.find((page) => page.id === facebook.activePageId);
  const tiktokName = tiktok?.account ? tiktok.account.displayName || tiktok.account.username : "";

  const options: {
    platform: Platform;
    label: string;
    detail: string;
    icon: typeof Clapperboard;
    tone: "youtube" | "facebook" | "tiktok";
    connected: boolean;
    warning: boolean;
    target: View;
  }[] = [
    {
      platform: "youtube", label: "YouTube Studio", tone: "youtube", icon: Clapperboard, target: "studio",
      detail: youtubeConnected ? "Đã kết nối kênh" : "Đồng bộ công khai", connected: youtubeConnected, warning: false,
    },
    {
      platform: "facebook", label: "Facebook Pages", tone: "facebook", icon: Share2, target: "facebook",
      detail: facebook?.reconnectRequired ? "Cần kết nối lại" : facebook?.connected ? activePage?.name || "Chọn Trang" : "Chưa kết nối",
      connected: !!facebook?.connected && !facebook.reconnectRequired, warning: !!facebook?.reconnectRequired,
    },
    {
      platform: "tiktok", label: "TikTok", tone: "tiktok", icon: Music4, target: "tiktok",
      detail: tiktok?.reconnectRequired ? "Cần kết nối lại" : tiktok?.connected ? tiktokName || "Đã kết nối" : "Chưa kết nối",
      connected: !!tiktok?.connected && !tiktok.reconnectRequired, warning: !!tiktok?.reconnectRequired,
    },
  ];

  return (
    <div className="platform-switch" role="group" aria-label="Chuyển kênh đăng nội dung">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.platform}
            type="button"
            aria-pressed={current === option.platform}
            className={`platform-option ${option.tone} ${current === option.platform ? "is-active" : ""}`}
            onClick={() => onNavigate(option.target)}
          >
            <span className="platform-option-icon"><Icon size={17} /></span>
            <span className="platform-option-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
            <span className={`platform-dot ${option.connected ? "on" : option.warning ? "warn" : ""}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
