"use client";

import { useState } from "react";
import { ArrowUpRight, CalendarDays, ChevronRight, CircleHelp, Clapperboard, House, Lightbulb, MoreHorizontal, Plus, Smartphone, Sparkles, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { ALL_NAVIGATION } from "@/lib/navigation";
import type { View } from "@/lib/types";

const coreViews: View[] = ["overview", "studio", "planner"];

export function MobileNavigation({ view, onNavigate, onCreate, onInstall, onHelp }: { view: View; onNavigate: (view: View) => void; onCreate: () => void; onInstall: () => void; onHelp: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const go = (next: View) => { setMoreOpen(false); onNavigate(next); };
  const tab = (target: View, label: string, Icon: typeof House) => (
    <button className={`mobile-tab ${view === target ? "active" : ""}`} onClick={() => go(target)} aria-current={view === target ? "page" : undefined} aria-label={`Mở ${label.toLocaleLowerCase("vi")}`}><span className="mobile-tab-icon"><Icon size={21} strokeWidth={view === target ? 2 : 1.7} /></span><span>{label}</span></button>
  );
  return <>
    <nav className="mobile-tabbar" aria-label="Điều hướng dưới"><div className="mobile-tabbar-inner">
      {tab("overview", "Tổng quan", House)}
      {tab("studio", "Studio", Clapperboard)}
      <button className="mobile-create-tab" onClick={onCreate} aria-label="Tạo nhanh nội dung"><span><Plus size={25} strokeWidth={1.8} /></span><small>Tạo mới</small></button>
      {tab("planner", "Lịch", CalendarDays)}
      <button className={`mobile-tab ${!coreViews.includes(view) || moreOpen ? "active" : ""}`} onClick={() => setMoreOpen(true)} aria-label="Mở tất cả công cụ" aria-haspopup="dialog" aria-expanded={moreOpen}><span className="mobile-tab-icon"><MoreHorizontal size={23} /></span><span>Thêm</span></button>
    </div></nav>
    <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Không gian của bạn" description="Mọi công cụ, trong tầm tay.">
      <div className="navigation-sheet"><div className="navigation-sheet-grid">{ALL_NAVIGATION.filter((item) => !coreViews.includes(item.id)).map((item) => <button key={item.id} onClick={() => go(item.id)} className={view === item.id ? "is-current" : ""}><span><item.icon size={21} strokeWidth={1.7} /></span><strong>{item.label}</strong><ChevronRight size={14} /></button>)}</div><div className="navigation-sheet-footer"><button onClick={() => { setMoreOpen(false); onInstall(); }}><Smartphone size={18} /><span>Ứng dụng TubeFlow<small>Cài đặt & trải nghiệm PWA</small></span><ArrowUpRight size={15} /></button><button onClick={() => { setMoreOpen(false); onHelp(); }}><CircleHelp size={18} /><span>Trung tâm trợ giúp<small>Luôn có một hướng dẫn dành cho bạn</small></span><ArrowUpRight size={15} /></button></div></div>
    </Modal>
  </>;
}

export function QuickCreateDialog({ open, onClose, onPlan, onIdea, onEditor, onUpload }: { open: boolean; onClose: () => void; onPlan: () => void; onIdea: () => void; onEditor: () => void; onUpload: () => void }) {
  const options = [
    { title: "Lên kế hoạch nội dung", caption: "Chọn ngày và phác thảo câu chuyện tiếp theo.", Icon: CalendarDays, action: onPlan, tone: "violet" },
    { title: "Ghi lại một ý tưởng", caption: "Giữ cảm hứng, phát triển khi bạn sẵn sàng.", Icon: Lightbulb, action: onIdea, tone: "orange" },
    { title: "Mở phòng dựng", caption: "Chỉnh ảnh, biên tập video và tạo thumbnail.", Icon: Wand2, action: onEditor, tone: "blue" },
    { title: "Đăng video lên YouTube", caption: "Chuẩn bị thông tin và kiểm tra trước khi đăng.", Icon: Clapperboard, action: onUpload, tone: "green" },
  ];
  return <Modal open={open} onClose={onClose} title="Điều tiếp theo bạn muốn tạo?" description="Một ý tưởng nhỏ. Một bước tiến mới."><div className="quick-create-options creator-create-options">{options.map(({ title, caption, Icon, action, tone }) => <button key={title} onClick={() => { onClose(); action(); }}><span className={`quick-create-icon tone-${tone}`}><Icon size={23} strokeWidth={1.7} /></span><span><strong>{title}</strong><small>{caption}</small></span><ArrowUpRight size={17} /></button>)}</div><div className="quick-create-note"><Sparkles size={15} /><span>Kế hoạch, ý tưởng và phòng dựng dùng được ngay, không cần kết nối YouTube.</span></div></Modal>;
}
