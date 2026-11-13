# Kết nối Facebook Pages với TubeFlow

## 1. Tạo ứng dụng Meta
1. Vào Meta for Developers → Create App → loại **Business**.
2. Thêm sản phẩm **Facebook Login for Business**.
3. Settings → Basic: sao chép **App ID** và **App Secret**.

## 2. Cấu hình .env (không đưa vào Git)
```
FACEBOOK_APP_ID=<App ID>
FACEBOOK_APP_SECRET=<App Secret>
META_GRAPH_VERSION=v25.0
APP_URL=https://<địa chỉ HTTPS của bạn>
```
Giữ nguyên `YOUTUBE_TOKEN_SECRET`. Token Facebook được mã hoá bằng khoá này; đổi khoá sẽ buộc kết nối lại.

## 3. Redirect URI
Thêm đúng từng ký tự vào Facebook Login → Valid OAuth Redirect URIs:
`<APP_URL>/api/facebook/callback`

## 4. Quyền
pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement, read_insights, business_management.
- Ở chế độ Development chỉ người có vai trò trên ứng dụng dùng được.
- Để người ngoài dùng, phải qua **App Review** và Business Verification khi cần.
- Doanh thu (content_monetization_earnings, monetization_approximate_earnings) chỉ trả về cho **Quản trị viên** Trang và Trang đủ điều kiện theo Meta.

## 5. Kiểm tra
1. Khởi động lại máy chủ sau khi sửa .env.
2. Mở TubeFlow → Facebook → Kết nối Facebook, đăng nhập tài khoản có quyền trên Trang.
3. Chọn Trang trong tab Kết nối Trang; tab Tổng quan phải hiện số liệu.
4. Soạn một bài văn bản nháp rồi kiểm tra trong tab Lịch & bài đăng.

## Giới hạn cần biết
- Reels: video dọc 9:16, 3–90 giây, tối thiểu 720p; API xử lý bất đồng bộ, trạng thái có thể cần vài phút.
- Hẹn giờ qua Facebook: từ 10 phút đến 30 ngày.
- Bài đã đăng chỉ xoá trực tiếp trên Facebook, TubeFlow không xoá thay.
- Số liệu doanh thu do Meta trả về thường là USD và có thể được điều chỉnh sau khi duyệt; luôn đối chiếu trong Meta Business Suite.
- Kiểm tra chính sách trong TubeFlow là bước sàng lọc sớm dựa trên luật, không thay thế quyết định của Meta.
