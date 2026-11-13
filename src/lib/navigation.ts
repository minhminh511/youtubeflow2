import { BarChart3, CalendarDays, Clapperboard, Coins, Grid2X2, Lightbulb, Link2, Music4, Settings2, Share2, Target, Wand2, type LucideIcon } from "lucide-react";
import type { View } from "@/lib/types";

export type NavigationItem = {
  id: View;
  label: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
};

export const NAVIGATION_GROUPS: { label: string; items: NavigationItem[] }[] = [
  {
    label: "KHÔNG GIAN LÀM VIỆC",
    items: [
      { id: "overview", label: "Tổng quan", description: "Mọi hoạt động sáng tạo trong một góc nhìn", keywords: "home dashboard trang chu", icon: Grid2X2 },
      { id: "studio", label: "YouTube Studio", description: "Quản lý video, đăng tải và kiểm tra nội dung", keywords: "video upload dang tai kenh", icon: Clapperboard },
      { id: "facebook", label: "Facebook", description: "Đăng bài, Reels, lên lịch và theo dõi doanh thu Trang", keywords: "facebook fb page trang reels bai viet kiem tien monetization meta", icon: Share2 },
      { id: "tiktok", label: "TikTok", description: "Đăng video, xu hướng và kiểm tra chính sách cộng đồng", keywords: "tiktok xu huong trend video ngan content posting fyp", icon: Music4 },
      { id: "planner", label: "Lịch nội dung", description: "Sắp xếp kế hoạch và lịch xuất bản", keywords: "lich ngay ke hoach schedule calendar", icon: CalendarDays },
    ],
  },
  {
    label: "CÔNG CỤ SÁNG TẠO",
    items: [
      { id: "editor", label: "Phòng dựng", description: "Biên tập video, chỉnh ảnh và tạo thumbnail", keywords: "edit image anh thumbnail video cat ghep", icon: Wand2 },
      { id: "ideas", label: "Kho ý tưởng", description: "Lưu cảm hứng và phát triển câu chuyện", keywords: "idea y tuong ghi chu", icon: Lightbulb },
    ],
  },
  {
    label: "PHÁT TRIỂN KÊNH",
    items: [
      { id: "strategy", label: "Chiến lược nội dung", description: "Trụ cột nội dung và nghiên cứu đối thủ", keywords: "strategy chien luoc doi thu dinh huong", icon: Target },
      { id: "analytics", label: "Phân tích", description: "Lượt xem, thời gian xem và tăng trưởng", keywords: "analytics thong ke so lieu bieu do", icon: BarChart3 },
      { id: "monetization", label: "Kiếm tiền", description: "Theo dõi doanh thu và điều kiện kiếm tiền", keywords: "revenue tien thu nhap doanh thu", icon: Coins },
    ],
  },
];

export const WORKSPACE_SETTINGS: NavigationItem[] = [
  { id: "connections", label: "Kết nối kênh", description: "Kết nối Google và cấu hình YouTube", keywords: "oauth google lien ket ket noi", icon: Link2 },
  { id: "settings", label: "Cài đặt", description: "Không gian, ứng dụng và xuất dữ liệu", keywords: "settings cai dat pwa ung dung", icon: Settings2 },
];

export const ALL_NAVIGATION = [...NAVIGATION_GROUPS.flatMap((group) => group.items), ...WORKSPACE_SETTINGS];

export const VIEW_LABELS = Object.fromEntries(ALL_NAVIGATION.map((item) => [item.id, item.label])) as Record<View, string>;

export function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi");
}
