import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FileText, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/ui";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
  note?: string;
}

export interface LegalDoc {
  kind: "privacy" | "terms";
  kicker: string;
  title: string;
  description: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const configuredEmail = process.env.LEGAL_CONTACT_EMAIL?.trim() || "";
  // A malformed value would create a broken mailto link; treat it as not configured.
  const contactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(configuredEmail) ? configuredEmail : "";
  const emailLooksWrong = configuredEmail.length > 0 && contactEmail === "";
  const entityName = process.env.LEGAL_ENTITY_NAME?.trim() || "TubeFlow";
  const otherDoc = doc.kind === "privacy"
    ? { href: "/dieu-khoan-su-dung", label: "Điều khoản sử dụng của TubeFlow" }
    : { href: "/chinh-sach-bao-mat", label: "Chính sách bảo mật của TubeFlow" };

  return (
    <div className="legal-shell">
      <header className="legal-topbar">
        <Link className="legal-brand" href="/" aria-label="TubeFlow — về ứng dụng">
          <BrandMark /><span>Tube<span>Flow</span><i /></span>
        </Link>
        <Link className="legal-back" href="/"><ArrowLeft size={15} />Quay lại ứng dụng</Link>
      </header>

      <main className="legal-main">
        <div className="legal-hero">
          <span className="legal-kicker">{doc.kind === "privacy" ? <ShieldCheck size={13} /> : <FileText size={13} />}{doc.kicker}</span>
          <h1>{doc.title}</h1>
          <p>{doc.intro}</p>
          <div className="legal-meta"><span>Cập nhật lần cuối: {doc.updated}</span><span aria-hidden="true">·</span><span>Áp dụng cho ứng dụng TubeFlow tại địa chỉ bạn đang truy cập</span></div>
        </div>

        <div className="legal-layout">
          <nav className="legal-toc" aria-label="Mục lục">
            <p>Nội dung</p>
            <ol>
              {doc.sections.map((section, index) => (
                <li key={section.id}><a href={`#${section.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>
              ))}
            </ol>
            <Link className="legal-toc-other" href={otherDoc.href}>{otherDoc.label}<ArrowUpRight size={13} /></Link>
          </nav>

          <article className="legal-article">
            {doc.sections.map((section, index) => (
              <section key={section.id} id={section.id}>
                <h2><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                {section.note && <p className="legal-note">{section.note}</p>}
              </section>
            ))}

            <section id="lien-he">
              <h2><span>{String(doc.sections.length + 1).padStart(2, "0")}</span>Liên hệ</h2>
              <p>
                Mọi câu hỏi, yêu cầu truy cập, chỉnh sửa hoặc xoá dữ liệu liên quan đến {doc.kind === "privacy" ? "chính sách bảo mật" : "điều khoản sử dụng"} này, vui lòng gửi tới đơn vị vận hành TubeFlow.
              </p>
              {contactEmail
                ? <p>Email liên hệ: <a className="legal-inline-link" href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
                : <p className="legal-note">{emailLooksWrong
                  ? <>Giá trị <code>LEGAL_CONTACT_EMAIL</code> trên máy chủ không phải địa chỉ email hợp lệ nên chưa được hiển thị. Hãy sửa lại, ví dụ <code>hotro@tenmien.vn</code>.</>
                  : <>Kênh liên hệ chính thức đang được cập nhật. Đơn vị vận hành cần cấu hình <code>LEGAL_CONTACT_EMAIL</code> trên máy chủ để hiển thị email hỗ trợ tại đây.</>}</p>}
              <p>Đơn vị vận hành: <strong>{entityName}</strong>.</p>
              <p className="legal-note">Hai thông tin trên lấy từ biến môi trường <code>LEGAL_CONTACT_EMAIL</code> và <code>LEGAL_ENTITY_NAME</code> trên máy chủ. Nếu để trống, trang dùng tên “TubeFlow”.</p>
            </section>

            <footer className="legal-article-footer">
              <Link href={otherDoc.href}>{otherDoc.label}<ArrowUpRight size={14} /></Link>
              <Link href="/">Quay lại ứng dụng<ArrowUpRight size={14} /></Link>
            </footer>
          </article>
        </div>
      </main>

      <footer className="legal-footer">
        <span>TubeFlow<i />Một không gian, nhiều khả năng.</span>
        <nav aria-label="Tài liệu pháp lý">
          <Link href="/chinh-sach-bao-mat">Chính sách bảo mật của TubeFlow</Link>
          <Link href="/dieu-khoan-su-dung">Điều khoản sử dụng của TubeFlow</Link>
        </nav>
      </footer>
    </div>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}
