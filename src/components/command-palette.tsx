"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Clapperboard, CornerDownLeft, FileText, Search } from "lucide-react";
import { Modal } from "@/components/ui";
import { ALL_NAVIGATION, searchText } from "@/lib/navigation";
import type { Plan, View, WorkspaceData } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  data: WorkspaceData;
  onNavigate: (view: View) => void;
  onPlan: (plan: Plan) => void;
  onVideo: (videoId: string) => void;
};

export function CommandPalette({ open, onClose, data, onNavigate, onPlan, onVideo }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const results = useMemo(() => {
    const text = searchText(query.trim());
    const destinations = ALL_NAVIGATION.filter((item) => !text || searchText(`${item.label} ${item.description} ${item.keywords}`).includes(text)).map((item) => ({
      id: `view-${item.id}`, title: item.label, subtitle: item.description, group: "ĐI ĐẾN", icon: item.icon, action: () => onNavigate(item.id),
    }));
    if (!text) return destinations.slice(0, 7);
    const plans = data.plans.filter((plan) => searchText(`${plan.title} ${plan.description}`).includes(text)).slice(0, 5).map((plan) => ({
      id: `plan-${plan.id}`, title: plan.title, subtitle: plan.status === "idea" ? "Ý tưởng · mở để chỉnh sửa" : "Kế hoạch · mở để chỉnh sửa", group: "NỘI DUNG CỦA BẠN", icon: FileText, action: () => onPlan(plan),
    }));
    const videos = data.videos.filter((video) => searchText(video.title).includes(text)).slice(0, 4).map((video) => ({
      id: `video-${video.id}`, title: video.title, subtitle: "Video đã đồng bộ · mở trong Studio", group: "VIDEO", icon: Clapperboard, action: () => onVideo(video.id),
    }));
    return [...destinations, ...plans, ...videos].slice(0, 12);
  }, [query, data.plans, data.videos, onNavigate, onPlan, onVideo]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-result-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(index: number) {
    const result = results[index];
    if (!result) return;
    onClose();
    result.action();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bạn đang tìm điều gì?" description="Tìm chức năng, kế hoạch và video trong không gian của bạn.">
      <div className="command-palette">
        <div className="command-input-wrap">
          <Search size={20} aria-hidden="true" />
          <input
            ref={input}
            aria-label="Tìm kiếm toàn bộ không gian"
            role="combobox"
            aria-expanded="true"
            aria-controls="workspace-search-results"
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `search-result-${results[active].id}` : undefined}
            value={query}
            placeholder="Thử “lịch”, “thumbnail”, hoặc tên nội dung…"
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter") { event.preventDefault(); choose(active); }
            }}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>
        <div ref={list} className="command-results" id="workspace-search-results" role="listbox" aria-label="Kết quả tìm kiếm">
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <div key={result.id}>
                {(index === 0 || results[index - 1].group !== result.group) && <p className="command-group" role="presentation">{result.group}</p>}
                <button id={`search-result-${result.id}`} role="option" aria-selected={active === index} data-result-index={index} className={`command-result ${active === index ? "is-active" : ""}`} onClick={() => choose(index)} onMouseMove={() => setActive(index)}>
                  <span className="command-result-icon"><Icon size={19} /></span>
                  <span><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            );
          })}
          {!results.length && <div className="command-empty"><Search size={25} /><strong>Chưa tìm thấy kết quả</strong><p>Thử một từ khoá ngắn hơn hoặc không dấu.</p></div>}
        </div>
        <div className="command-footer"><span><ArrowUp size={12} /><ArrowDown size={12} /> để di chuyển</span><span><CornerDownLeft size={13} /> để mở</span><span>Dữ liệu riêng trong workspace</span></div>
      </div>
    </Modal>
  );
}
