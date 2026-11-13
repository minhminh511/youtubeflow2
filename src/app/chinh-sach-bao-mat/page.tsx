import type { Metadata } from "next";
import { LegalPage, type LegalDoc } from "@/components/legal-page";

// Contact details come from server environment variables, so render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chính sách bảo mật của TubeFlow",
  description: "Chính sách bảo mật của TubeFlow: dữ liệu được lưu, cookie phiên, token mã hoá, quyền của bạn và cách yêu cầu xoá dữ liệu.",
  robots: { index: true, follow: true },
};

const doc: LegalDoc = {
  kind: "privacy",
  kicker: "BẢO MẬT & DỮ LIỆU",
  title: "Chính sách bảo mật của TubeFlow",
  description: "Dữ liệu được lưu, cookie phiên, token mã hoá và quyền của bạn.",
  intro: "Chính sách này giải thích TubeFlow thu thập, sử dụng và bảo vệ dữ liệu gì khi bạn lên kế hoạch nội dung, biên tập ảnh/video và kết nối các nền tảng YouTube, Facebook, TikTok. Nội dung được viết theo đúng những gì ứng dụng thực sự làm.",
  updated: "13/11/2026",
  sections: [
    {
      id: "pham-vi",
      title: "Phạm vi áp dụng",
      paragraphs: [
        "Chính sách này áp dụng cho ứng dụng TubeFlow và mọi trang trong cùng tên miền mà bạn đang truy cập, bao gồm không gian làm việc, phòng dựng, YouTube Studio, Facebook Pages và TikTok Studio.",
        "TubeFlow không yêu cầu tạo tài khoản. Không gian làm việc được nhận diện bằng một cookie phiên đặt trên trình duyệt của bạn.",
      ],
    },
    {
      id: "du-lieu-luu",
      title: "Dữ liệu TubeFlow lưu",
      paragraphs: ["TubeFlow lưu những dữ liệu tối thiểu cần thiết để các tính năng hoạt động:"],
      items: [
        "Tên không gian làm việc, tiến độ các bước thiết lập và các tuỳ chọn bạn đã chọn.",
        "Ý tưởng, kế hoạch, lịch nội dung và ghi chú do bạn tạo.",
        "Khi bạn kết nối YouTube: tên kênh, ảnh đại diện, số người đăng ký, lượt xem, danh sách video công khai và token OAuth đã mã hoá.",
        "Khi bạn kết nối Facebook: tên người dùng, danh sách Trang bạn quản lý, thông tin Trang và token Trang đã mã hoá.",
        "Khi bạn kết nối TikTok: tên hiển thị, tên người dùng, ảnh đại diện, các chỉ số công khai và token truy cập/refresh token đã mã hoá.",
        "Lịch sử đăng bài và doanh thu Trang do bạn nhập hoặc do Meta trả về, cùng điểm kiểm tra chính sách của từng nội dung.",
        "Nhật ký hoạt động ghi lại các thao tác trên ứng dụng để bạn truy vết.",
      ],
      note: "TubeFlow không lưu mật khẩu Google, Facebook hay TikTok của bạn. Ứng dụng không đọc mật khẩu và không có chức năng đăng nhập bằng mật khẩu.",
    },
    {
      id: "cookie",
      title: "Cookie và phiên làm việc",
      paragraphs: [
        "TubeFlow dùng một cookie phiên HttpOnly chứa chuỗi ngẫu nhiên để nhận diện không gian làm việc. Cơ sở dữ liệu chỉ lưu giá trị băm SHA-256 của chuỗi này, không lưu giá trị gốc.",
        "Trong quá trình kết nối nền tảng, cookie trạng thái tạm thời được đặt để chống giả mạo yêu cầu. Cookie này chỉ tồn tại khoảng 10 phút và bị xoá ngay sau khi quá trình kết nối kết thúc.",
        "TubeFlow không sử dụng cookie quảng cáo, không nhúng mã theo dõi của bên thứ ba và không bán dữ liệu cho bất kỳ ai.",
      ],
      note: "Nếu bạn xoá cookie của trình duyệt, bạn sẽ mất quyền truy cập vào không gian hiện tại vì TubeFlow chưa có tính năng đăng nhập hoặc phục hồi giữa các thiết bị. Hãy xuất bản sao dữ liệu trước khi xoá.",
    },
    {
      id: "chia-se",
      title: "Khi nào dữ liệu được gửi tới nền tảng khác",
      paragraphs: [
        "TubeFlow chỉ gửi dữ liệu tới nền tảng bên thứ ba khi bạn chủ động thực hiện thao tác, ví dụ: đăng video lên YouTube, đăng bài hoặc Reels lên Facebook, đăng video lên TikTok, hoặc yêu cầu đồng bộ số liệu.",
        "Việc gửi dữ liệu tuân theo chính sách của chính nền tảng đó. Hiện TubeFlow có thể kết nối với Google/YouTube, Meta/Facebook và TikTok.",
        "TubeFlow không chia sẻ dữ liệu của bạn cho bên thứ ba nào khác, không dùng dữ liệu để huấn luyện mô hình AI và không bán dữ liệu.",
      ],
    },
    {
      id: "bao-mat",
      title: "Cách dữ liệu được bảo vệ",
      items: [
        "Token truy cập của YouTube, Facebook và TikTok được mã hoá bằng AES-256-GCM trước khi ghi vào cơ sở dữ liệu.",
        "Khoá mã hoá và khoá bí mật của ứng dụng chỉ tồn tại ở phía máy chủ, không bao giờ gửi về trình duyệt.",
        "Mọi thao tác ghi đều kiểm tra nguồn gửi yêu cầu để hạn chế tấn công giả mạo từ trang khác.",
        "Truy vấn dữ liệu được giới hạn theo đúng không gian làm việc của bạn.",
      ],
      note: "Không có hệ thống nào an toàn tuyệt đối. Nếu bạn nghi ngờ kết nối bị lộ, hãy ngắt kết nối nền tảng đó trong mục Kết nối kênh và thu hồi quyền truy cập trên trang tài khoản của Google, Facebook hoặc TikTok.",
    },
    {
      id: "thoi-gian",
      title: "Thời gian lưu trữ",
      paragraphs: [
        "Dữ liệu kế hoạch, ý tưởng và lịch sử đăng bài được giữ cho đến khi bạn xoá hoặc cho đến khi không gian làm việc không còn được sử dụng.",
        "Khi bạn ngắt kết nối một nền tảng, token và thông tin kênh tương ứng bị xoá khỏi TubeFlow. Nội dung đã đăng trên nền tảng đó vẫn được giữ nguyên và bạn cần xoá trực tiếp tại nền tảng nếu muốn.",
        "Báo cáo phân tích từ YouTube, Facebook và TikTok được lấy trực tiếp mỗi khi bạn mở trang và không được lưu thành bản sao lâu dài, trừ số liệu doanh thu bạn chủ động đồng bộ hoặc nhập vào.",
      ],
    },
    {
      id: "quyen",
      title: "Quyền của bạn",
      items: [
        "Xem dữ liệu: mọi dữ liệu trong không gian của bạn đều hiển thị trực tiếp trong ứng dụng.",
        "Xuất dữ liệu: vào Cài đặt để tải bản sao dạng JSON. Bản xuất không bao gồm token hay khoá bí mật.",
        "Xoá dữ liệu: xoá từng nội dung trong ứng dụng, hoặc ngắt kết nối để xoá token và thông tin kênh.",
        "Thu hồi quyền: thu hồi quyền truy cập ứng dụng ngay trên trang tài khoản Google, Facebook hoặc TikTok.",
      ],
    },
    {
      id: "tre-em",
      title: "Trẻ em",
      paragraphs: [
        "TubeFlow không dành cho người dưới độ tuổi được pháp luật cho phép sử dụng các nền tảng mạng xã hội liên quan, và không cố ý thu thập dữ liệu của trẻ em. Nếu phát hiện dữ liệu như vậy, đơn vị vận hành sẽ xoá.",
      ],
    },
    {
      id: "thay-doi",
      title: "Thay đổi chính sách",
      paragraphs: [
        "Khi cách xử lý dữ liệu thay đổi, chính sách này sẽ được cập nhật và ngày cập nhật ở đầu trang sẽ thay đổi. Việc tiếp tục sử dụng TubeFlow sau khi cập nhật đồng nghĩa bạn chấp nhận nội dung mới.",
      ],
    },
  ],
};

export default function PrivacyPage() {
  return <LegalPage doc={doc} />;
}
