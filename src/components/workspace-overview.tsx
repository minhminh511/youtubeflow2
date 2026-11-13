"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, CalendarCheck2, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Clock3, Film, Lightbulb, Link2, Plus, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { YouTubeMark } from "@/components/ui";
import { formatNumber } from "@/lib/client";
import type { Plan, View, WorkspaceData } from "@/lib/types";

function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const dateOf = (value: string) => new Date(`${value}T12:00:00Z`);
const dayKey = (value: Date) => value.toISOString().slice(0, 10);
const displayDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", day: "numeric", month: "long" }).format(dateOf(value));
const FORMAT_LABELS = { video: "Video dài", short: "Shorts", live: "Trực tiếp" };
const STATUS_LABELS = { idea: "Ý tưởng", planned: "Đã lên lịch", published: "Hoàn thành" };

type Props = {
  data: WorkspaceData;
  initialized: boolean;
  onNavigate: (view: View) => void;
  onCreate: (date?: string) => void;
  onIdea: () => void;
  onUpload: () => void;
  onOpenPlan: (plan: Plan) => void;
};

export function WorkspaceOverview({ data, initialized, onNavigate, onCreate, onIdea, onUpload, onOpenPlan }: Props) {
  const [today] = useState(vietnamToday);
  const [selected, setSelected] = useState(vietnamToday);
  const [weekOffset, setWeekOffset] = useState(0);
  const week = useMemo(() => {
    const monday = dateOf(today);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setUTCDate(monday.getUTCDate() + index);
      return { key: dayKey(day), date: day.getUTCDate(), label: index === 6 ? "CN" : `T${index + 2}` };
    });
  }, [today, weekOffset]);
  const inDay = data.plans.filter((plan) => plan.scheduledDate === selected);
  const scheduled = data.plans.filter((plan) => plan.status === "planned");
  const ideas = data.plans.filter((plan) => plan.status === "idea");
  const published = data.plans.filter((plan) => plan.status === "published");
  const recent = [...data.plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const stats = [
    { label: "Ý tưởng đang ấp ủ", count: ideas.length, note: "Cảm hứng cho nội dung tiếp theo", icon: Lightbulb, tone: "violet", view: "ideas" as View },
    { label: "Nội dung đã lên lịch", count: scheduled.length, note: "Sẵn sàng cho ngày xuất bản", icon: CalendarDays, tone: "blue", view: "planner" as View },
    { label: "Kế hoạch hoàn thành", count: published.length, note: "Từng bước, đều đặn tiến lên", icon: CalendarCheck2, tone: "green", view: "planner" as View },
    { label: "Video đã đồng bộ", count: data.videos.length, note: data.channel ? "Từ kênh YouTube đã kết nối" : "Kết nối kênh để đọc dữ liệu thật", icon: Clapperboard, tone: "orange", view: "studio" as View },
  ];
  const actions = [
    { title: "Đăng video", caption: "Kiểm tra trước khi đăng", icon: Clapperboard, tone: "violet", action: onUpload },
    { title: "Làm thumbnail", caption: "Mở phòng dựng ảnh", icon: Wand2, tone: "blue", action: () => onNavigate("editor") },
    { title: "Lưu ý tưởng", caption: "Giữ lại cảm hứng mới", icon: Lightbulb, tone: "orange", action: onIdea },
    { title: "Xem phân tích", caption: "Hiểu khán giả của bạn", icon: CalendarCheck2, tone: "green", action: () => onNavigate("analytics") },
  ];

  function changeWeek(offset: number) {
    setWeekOffset(offset);
    const day = dateOf(today);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7) + offset * 7);
    setSelected(offset === 0 ? today : dayKey(day));
  }

  return (
    <div className="creator-dashboard">
      <header className="dashboard-heading">
        <div><p className="section-kicker">MỖI NGÀY, MỘT ĐIỀU MỚI</p><h1>Chào bạn, nhà sáng tạo<span className="greeting-spark"><Sparkles size={25} strokeWidth={1.6} /></span></h1><p>Cảm hứng, kế hoạch và kênh của bạn. Tất cả ở đây.</p></div>
        <button className="dashboard-date" onClick={() => onNavigate("planner")}><CalendarDays size={15} /><span>{displayDate(today)}, {dateOf(today).getUTCFullYear()}</span><ChevronRight size={14} /></button>
      </header>

      <section className="creative-banner">
        <div className="creative-banner-content">
          <span className="creative-banner-label"><span /><span>KHÔNG GIAN CHO ĐIỀU HAY HO</span></span>
          <h2>Ý tưởng hay xứng đáng<br />được <span>thành hình.</span></h2>
          <p>Từ một dòng ghi chú đến video tiếp theo.<br className="desktop-linebreak" /> Sáng tạo có định hướng, theo cách của bạn.</p>
          <div className="creative-banner-actions"><button className="button button-primary" onClick={() => onCreate()}><Plus size={16} />Tạo nội dung mới</button><button className="banner-secondary" onClick={() => onNavigate("studio")}>Khám phá Studio<ArrowRight size={15} /></button></div>
        </div>
        <div className="creative-illustration" aria-hidden="true">
          <span className="illustration-orbit orbit-a" /><span className="illustration-orbit orbit-b" />
          <div className="illustration-back-card"><div /><div /><div /></div>
          <div className="illustration-storyboard">
            <div className="storyboard-top"><span /><span /><span /><i>your next story</i></div>
            <div className="storyboard-scene"><div className="scene-mountain one" /><div className="scene-mountain two" /><span className="scene-sun" /><span className="scene-play"><svg width="19" height="22" viewBox="0 0 19 22" fill="none"><path d="M3 2L17 11L3 20V2Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /></svg></span></div>
            <div className="storyboard-lines"><span /><span /><i /><i /><i /></div>
          </div>
          <div className="illustration-label label-ready"><span><Check size={13} strokeWidth={2.4} /></span>Sẵn sàng sáng tạo</div>
          <div className="illustration-note"><Lightbulb size={19} /><span>Một ý tưởng mới<small>Vô vàn khả năng.</small></span><Sparkles size={14} /></div>
          <Sparkles className="illustration-spark spark-one" size={21} /><Plus className="illustration-spark spark-two" size={19} />
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Số liệu không gian" aria-busy={!initialized}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return <button key={stat.label} className="dashboard-metric" onClick={() => onNavigate(stat.view)}><div className="metric-top"><span className={`metric-icon tone-${stat.tone}`}><Icon size={18} strokeWidth={1.7} /></span><ArrowUpRight size={16} /></div><span className="metric-value">{initialized ? stat.count.toLocaleString("vi-VN") : <span className="metric-skeleton" />}</span><strong>{stat.label}</strong><small>{stat.note}</small></button>;
        })}
      </section>

      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <section className="workspace-panel schedule-panel">
            <header className="workspace-panel-heading"><div><h2>Lịch xuất bản<span className="panel-count">{scheduled.length}</span></h2><p>Một nhịp sáng tạo đều đặn, bắt đầu từ hôm nay.</p></div><button className="subtle-link" onClick={() => onNavigate("planner")}>Xem lịch<ArrowUpRight size={14} /></button></header>
            <div className="schedule-week-heading"><span>{weekOffset === 0 ? "Tuần này" : weekOffset === 1 ? "Tuần sau" : weekOffset === -1 ? "Tuần trước" : "Lịch trong tuần"}<small>{displayDate(week[0].key)} – {displayDate(week[6].key)}</small></span><div><button className="week-today" onClick={() => changeWeek(0)}>Hôm nay</button><button className="compact-icon-button" onClick={() => changeWeek(weekOffset - 1)} aria-label="Tuần trước"><ChevronLeft size={17} /></button><button className="compact-icon-button" onClick={() => changeWeek(weekOffset + 1)} aria-label="Tuần sau"><ChevronRight size={17} /></button></div></div>
            <div className="schedule-week" role="group" aria-label="Chọn ngày trong tuần">{week.map((day) => {
              const count = data.plans.filter((plan) => plan.scheduledDate === day.key).length;
              return <button key={day.key} className={`schedule-day ${day.key === selected ? "is-selected" : ""} ${day.key === today ? "is-today" : ""}`} aria-pressed={day.key === selected} data-date={day.key} aria-label={`${day.label}, ${displayDate(day.key)}${count ? `, ${count} nội dung` : ""}`} onClick={() => setSelected(day.key)}><span>{day.label}</span><strong>{day.date}</strong><i className={count ? "has-content" : ""} /></button>;
            })}</div>
            <div className="day-agenda"><div className="day-agenda-heading"><span>{selected === today ? "KẾ HOẠCH HÔM NAY" : displayDate(selected).toLocaleUpperCase("vi")}</span><button onClick={() => onCreate(selected)} aria-label={`Thêm kế hoạch ngày ${displayDate(selected)}`}><Plus size={15} /></button></div>{inDay.length ? <div className="dashboard-plan-list">{inDay.slice(0, 4).map((plan) => <button key={plan.id} onClick={() => onOpenPlan(plan)} className="dashboard-plan"><span className={`plan-format-symbol ${plan.format}`}><Film size={17} /></span><span><strong>{plan.title}</strong><small>{FORMAT_LABELS[plan.format]}</small></span><span className={`plan-status ${plan.status}`}>{STATUS_LABELS[plan.status]}</span><ChevronRight size={15} /></button>)}</div> : <div className="day-empty"><span className="day-empty-icon"><CalendarDays size={25} strokeWidth={1.5} /><i><Plus size={11} /></i></span><div><h3>Một khoảng trống cho ý tưởng hay</h3><p>Chưa có nội dung cho ngày này. Cùng lên kế hoạch nhé?</p><button className="subtle-link" onClick={() => onCreate(selected)}>Thêm vào lịch<ArrowRight size={14} /></button></div></div>}</div>
          </section>

          <section className="workspace-panel recent-panel">
            <header className="workspace-panel-heading"><div><h2>Đang trên hành trình</h2><p>Tiếp tục từ nơi bạn đã dừng lại.</p></div><span className="panel-header-icon"><Clock3 size={17} /></span></header>
            {recent.length ? <div className="dashboard-recent-list">{recent.map((plan) => <button key={plan.id} className="dashboard-recent" onClick={() => onOpenPlan(plan)}><span className={`recent-status-icon ${plan.status}`}>{plan.status === "published" ? <CheckCircle2 size={17} /> : plan.status === "idea" ? <Lightbulb size={17} /> : <CalendarDays size={17} />}</span><span><strong>{plan.title}</strong><small>{FORMAT_LABELS[plan.format]} · {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(plan.updatedAt))}</small></span><span className={`plan-status ${plan.status}`}>{STATUS_LABELS[plan.status]}</span><ArrowUpRight size={15} /></button>)}</div> : <div className="getting-started-flow">{[{ label: "Ghi lại ý tưởng", caption: "Bắt đầu từ cảm hứng", icon: Lightbulb, action: onIdea }, { label: "Lên kế hoạch", caption: "Dành chỗ cho sáng tạo", icon: CalendarDays, action: () => onCreate() }, { label: "Làm điều khác biệt", caption: "Biến ý tưởng thành video", icon: Wand2, action: () => onNavigate("editor") }].map((step, index) => <button key={step.label} onClick={step.action}><span className="flow-step-number">0{index + 1}</span><step.icon size={19} /><strong>{step.label}</strong><small>{step.caption}</small><ArrowUpRight size={13} /></button>)}</div>}
          </section>
        </div>

        <aside className="dashboard-secondary">
          <section className="workspace-panel dashboard-channel"><header className="workspace-panel-heading"><h2>Kênh của bạn</h2><button className="compact-icon-button" onClick={() => onNavigate("connections")} aria-label="Quản lý kết nối kênh"><ArrowUpRight size={16} /></button></header><div className="channel-identity">{data.channel?.thumbnail ? <Image src={data.channel.thumbnail} alt="" width={40} height={40} unoptimized /> : <span className="channel-youtube-icon"><YouTubeMark /></span>}<div><h3>{data.channel?.title || "Câu chuyện của bạn"}</h3><span className={`channel-connection-state ${data.channel ? "connected" : ""}`}><i />{data.channel ? "Đã kết nối YouTube" : "Chưa kết nối kênh"}</span></div></div><div className="channel-mini-metrics"><div><strong>{data.channel ? formatNumber(data.channel.subscribers) : "—"}</strong><small>Người đăng ký</small></div><div><strong>{data.channel ? formatNumber(data.channel.videoCount) : "—"}</strong><small>Video trên kênh</small></div></div>{!data.channel && <p className="channel-connection-copy">Mang dữ liệu thật của kênh vào không gian sáng tạo. An toàn, riêng tư, luôn trong tầm kiểm soát.</p>}<button className={`button ${data.channel ? "button-secondary" : "button-primary"} channel-connect-button`} onClick={() => onNavigate(data.channel ? "studio" : "connections")}><Link2 size={14} />{data.channel ? "Quản lý kênh trong Studio" : "Kết nối YouTube"}<ArrowRight size={14} /></button><p className="channel-security"><ShieldCheck size={11} />Token được mã hoá trên máy chủ</p></section>

          <section className="workspace-panel dashboard-quick-actions"><header className="workspace-panel-heading"><h2>Bắt nhịp sáng tạo</h2><Sparkles size={16} /></header><div className="quick-action-grid">{actions.map((action) => <button key={action.title} onClick={action.action}><span className={`quick-action-symbol tone-${action.tone}`}><action.icon size={19} strokeWidth={1.7} /></span><ArrowUpRight size={13} className="quick-action-arrow" /><strong>{action.title}</strong><small>{action.caption}</small></button>)}</div></section>

          <section className="creator-note"><span className="creator-note-icon"><Lightbulb size={18} /></span><div><span className="creator-note-kicker">MỘT CHÚT CẢM HỨNG</span><h3>Đều đặn tốt hơn hoàn hảo.</h3><p>Mỗi nội dung là một lần bạn hiểu khán giả hơn. Bắt đầu nhỏ, nhưng đừng ngừng kể chuyện.</p><button onClick={() => onNavigate("strategy")}>Tìm hướng đi cho kênh<ArrowRight size={13} /></button></div></section>
        </aside>
      </div>
      <div className="dashboard-footnote"><ShieldCheck size={12} /><span>Kế hoạch lưu tại TubeFlow. Video chỉ được đăng khi bạn chủ động xác nhận.</span></div>
    </div>
  );
}
