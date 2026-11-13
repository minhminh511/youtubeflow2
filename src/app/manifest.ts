import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TubeFlow — Không gian sáng tạo",
    short_name: "TubeFlow",
    description: "Lên kế hoạch, biên tập nội dung và quản lý kênh YouTube trong một không gian dành riêng cho bạn.",
    lang: "vi",
    dir: "ltr",
    start_url: "/?view=overview&source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fc",
    theme_color: "#f7f8fc",
    categories: ["productivity", "utilities"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "YouTube Studio", short_name: "Studio", description: "Quản lý và chuẩn bị đăng video", url: "/?view=studio", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Lịch nội dung", short_name: "Lịch", description: "Mở kế hoạch nội dung", url: "/?view=planner", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Phòng dựng", short_name: "Dựng", description: "Chỉnh sửa ảnh và video", url: "/?view=editor", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Kho ý tưởng", short_name: "Ý tưởng", description: "Mở cảm hứng đã lưu", url: "/?view=ideas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
