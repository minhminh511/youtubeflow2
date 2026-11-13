import type { Metadata } from "next";
import { LegalPage, type LegalDoc } from "@/components/legal-page";

// Contact details come from server environment variables, so render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng của TubeFlow",
  description: "Điều khoản sử dụng của TubeFlow: phạm vi dịch vụ, trách nhiệm nội dung, kết nối nền tảng, giới hạn và quyền của bạn.",
  robots: { index: true, follow: true },
};

const doc: LegalDoc = {
  kind: "terms",
  kicker: "ĐIỀU KHOẢN & TRÁCH NHIỆM",
  title: "Điều khoản sử dụng của TubeFlow",
  description: "Phạm vi dịch vụ, trách nhiệm nội dung và giới hạn của TubeFlow.",
  intro: "Khi sử dụng TubeFlow, bạn đồng ý với các điều khoản dưới đây. Vui lòng đọc kỹ, đặc biệt phần về trách nhiệm nội dung và giới hạn của dịch vụ.",
  updated: "13/11/2026",
  sections: [
    {
      id: "chap-nhan",
      title: "Chấp nhận điều khoản",
      paragraphs: [
        "Bằng việc truy cập hoặc sử dụng TubeFlow, bạn xác nhận đã đọc và đồng ý với các điều khoản này cùng Chính sách bảo mật của TubeFlow.",
        "Nếu bạn không đồng ý, vui lòng không sử dụng ứng dụng.",
      ],
    },
    {
      id: "dich-vu",
      title: "TubeFlow cung cấp gì",
      paragraphs: ["TubeFlow là công cụ hỗ trợ nhà sáng tạo nội dung, bao gồm:"],
      items: [
        "Lưu ý tưởng, lên kế hoạch và xếp lịch nội dung.",
        "Biên tập ảnh và video ngay trên trình duyệt, xuất tệp về máy của bạn.",
        "Hỗ trợ chuẩn bị nội dung trước khi đăng: gợi ý tiêu đề, mô tả, hashtag, chương và kiểm tra sơ bộ theo chính sách công bố của các nền tảng.",
        "Kết nối tài khoản YouTube, Facebook và TikTok để đăng nội dung và đọc số liệu do chính nền tảng cung cấp.",
        "Theo dõi doanh thu Trang Facebook do Meta trả về hoặc do bạn tự nhập.",
      ],
    },
    {
      id: "trach-nhiem",
      title: "Trách nhiệm của bạn với nội dung",
      paragraphs: [
        "Bạn chịu trách nhiệm hoàn toàn về nội dung mình tạo, tải lên và đăng, cũng như về bất kỳ tệp nào bạn sử dụng trong phòng dựng.",
      ],
      items: [
        "Bạn phải có quyền sử dụng hình ảnh, video, âm nhạc và mọi tư liệu bạn đưa vào nội dung.",
        "Bạn có trách nhiệm tuân thủ Nguyên tắc cộng đồng, chính sách bản quyền, quy định về nội dung có thương hiệu và mọi quy định áp dụng của YouTube, Facebook, TikTok.",
        "Bạn tuân thủ pháp luật Việt Nam và pháp luật áp dụng cho khán giả của mình.",
      ],
      note: "Tính năng kiểm tra chính sách trong TubeFlow là bước sàng lọc sớm dựa trên các quy định công bố. Kết quả chỉ mang tính tham khảo và không bảo đảm nội dung sẽ được nền tảng chấp thuận, giữ lại hay phân phối rộng.",
    },
    {
      id: "tai-khoan",
      title: "Tài khoản, kết nối và bảo mật",
      paragraphs: [
        "TubeFlow không có mật khẩu riêng. Không gian làm việc gắn với cookie trên trình duyệt bạn đang dùng. Vì vậy, ai sử dụng được trình duyệt đó cũng mở được không gian của bạn.",
        "Bạn chịu trách nhiệm bảo quản thiết bị và cookie. Hãy xuất bản sao dữ liệu trước khi xoá cookie hoặc đổi thiết bị.",
        "Khi kết nối YouTube, Facebook hoặc TikTok, bạn cấp cho TubeFlow quyền theo đúng những phạm vi đã đồng ý. Bạn có thể thu hồi quyền bất cứ lúc nào bằng cách ngắt kết nối trong ứng dụng hoặc thu hồi tại trang tài khoản của nền tảng.",
      ],
    },
    {
      id: "noi-dung-cam",
      title: "Nội dung không được phép",
      paragraphs: ["Bạn không được sử dụng TubeFlow để tạo, lưu hay đăng nội dung:"],
      items: [
        "Xâm hại tình dục, khiêu dâm, bạo lực, gây sốc hoặc kích động thù ghét.",
        "Quấy rối, đe doạ hoặc xúc phạm cá nhân, nhóm người.",
        "Hướng dẫn hành vi nguy hiểm, chế tạo vũ khí hoặc chất cấm.",
        "Lừa đảo, cam kết lợi nhuận không có căn cứ hoặc xâm phạm dữ liệu cá nhân của người khác.",
        "Vi phạm bản quyền hoặc sử dụng tài khoản không thuộc quyền kiểm soát của bạn.",
        "Vi phạm pháp luật hiện hành.",
      ],
      note: "TubeFlow có thể từ chối gửi nội dung tới nền tảng nếu phát hiện dấu hiệu vi phạm rõ ràng. Việc này không thay thế trách nhiệm pháp lý của bạn.",
    },
    {
      id: "nen-tang",
      title: "Mối quan hệ với các nền tảng bên thứ ba",
      paragraphs: [
        "TubeFlow hoạt động dựa trên API chính thức của Google/YouTube, Meta/Facebook và TikTok, và phải tuân theo điều khoản của các nền tảng này.",
        "Việc đăng nội dung phụ thuộc vào quyền đã được cấp, trạng thái kiểm duyệt ứng dụng của nền tảng và các giới hạn của nền tảng. Nếu ứng dụng chưa được nền tảng kiểm duyệt, nội dung có thể chỉ được đăng ở chế độ riêng tư.",
        "TubeFlow không kiểm soát và không chịu trách nhiệm về quyết định của các nền tảng trong việc hiển thị, gỡ bỏ, hạn chế phân phối hoặc tính doanh thu cho nội dung của bạn.",
      ],
    },
    {
      id: "gioi-han",
      title: "Giới hạn của dịch vụ",
      items: [
        "Không bảo đảm nội dung sẽ được nền tảng chấp thuận, giữ lại hoặc lên xu hướng.",
        "Số liệu, doanh thu và gợi ý hiển thị phụ thuộc dữ liệu do nền tảng trả về và có thể trễ, thay đổi hoặc không đầy đủ.",
        "Ứng dụng có thể tạm ngừng khi nền tảng thay đổi API, khi hết hạn quyền truy cập hoặc khi cần bảo trì.",
        "Không sử dụng TubeFlow cho mục đích vận hành tự động quy mô lớn trái điều khoản của các nền tảng.",
      ],
    },
    {
      id: "so-huu",
      title: "Sở hữu trí tuệ",
      paragraphs: [
        "Bạn giữ toàn bộ quyền đối với nội dung mình tải lên. Bạn cho phép TubeFlow xử lý nội dung ở mức cần thiết để thực hiện các thao tác bạn yêu cầu, chẳng hạn biên tập trên trình duyệt hoặc gửi tới nền tảng.",
        "Giao diện, mã nguồn và thương hiệu TubeFlow thuộc về đơn vị vận hành.",
      ],
    },
    {
      id: "gioi-han-trach-nhiem",
      title: "Giới hạn trách nhiệm",
      paragraphs: [
        "Trong phạm vi pháp luật cho phép, đơn vị vận hành không chịu trách nhiệm cho thiệt hại gián tiếp, mất dữ liệu do xoá cookie hoặc thiết bị hỏng, mất doanh thu, mất cơ hội kinh doanh, hoặc hậu quả từ việc nền tảng gỡ nội dung, hạn chế tài khoản theo chính sách của họ.",
        "Bạn nên duy trì bản sao nội dung quan trọng ở nơi khác.",
      ],
    },
    {
      id: "cham-dut",
      title: "Tạm ngừng và chấm dứt",
      paragraphs: [
        "Bạn có thể ngừng sử dụng bất cứ lúc nào bằng cách ngắt kết nối các nền tảng và xoá dữ liệu khỏi ứng dụng.",
        "TubeFlow có thể tạm ngừng hoặc chấm dứt quyền truy cập nếu phát hiện sử dụng sai mục đích, vi phạm điều khoản hoặc gây hại cho hệ thống hay người khác.",
      ],
    },
    {
      id: "thay-doi-dieu-khoan",
      title: "Thay đổi điều khoản",
      paragraphs: [
        "Điều khoản này có thể được cập nhật khi tính năng thay đổi. Ngày cập nhật ở đầu trang sẽ được điều chỉnh tương ứng.",
      ],
    },
    {
      id: "luat-ap-dung",
      title: "Luật áp dụng",
      paragraphs: [
        "Điều khoản này được điều chỉnh theo pháp luật Việt Nam. Các bên ưu tiên giải quyết tranh chấp thông qua thương lượng thiện chí; nếu không đạt kết quả, tranh chấp được đưa ra cơ quan có thẩm quyền theo quy định của pháp luật.",
      ],
    },
  ],
};

export default function TermsPage() {
  return <LegalPage doc={doc} />;
}
