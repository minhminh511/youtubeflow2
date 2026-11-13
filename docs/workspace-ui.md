# TubeFlow — Creator Workspace cho PC và PWA mobile

## Thay đổi giao diện

- Trang mặc định là Tổng quan, không còn bắt đầu ở trang cấu hình kết nối.
- Sidebar PC chia theo Không gian làm việc, Công cụ sáng tạo và Phát triển kênh.
- Header cố định có tìm kiếm nhanh, trạng thái workspace, làm mới và thông báo.
- Tổng quan có số liệu từ workspace, lịch tuần tương tác, kế hoạch gần đây, trạng thái kết nối kênh và các thao tác nhanh.
- Ctrl/Cmd + K tìm kiếm chức năng, nội dung đã lưu và video đã đồng bộ; hỗ trợ từ khoá không dấu, phím mũi tên và Enter.
- Chọn một ngày trong lịch tuần để mở form lên kế hoạch với đúng ngày đó. Chọn một nội dung từ kết quả tìm kiếm để mở form chỉnh sửa.
- Mobile/PWA có thanh tab Tổng quan / Studio / Tạo mới / Lịch / Thêm. Menu Thêm mở toàn bộ công cụ, không phải thu nhỏ sidebar PC.
- Menu Tạo mới mở kế hoạch, ý tưởng, phòng dựng hoặc tab đăng video trong Studio.
- Phòng dựng chuyển bố cục theo không gian còn lại; tool tabs cuộn ngang trên mobile. Đã sửa tải lại canvas khi ảnh sẵn sàng, vị trí lớp chữ và liên kết tỉ lệ crop với kích thước xuất.
- Studio có tab cuộn ngang trên mobile và nhận deep link như `/?view=studio&tab=upload`.
- PWA dùng safe-area ở thanh header/tab, vùng thao tác cảm ứng và cỡ input tránh zoom tự động trên iPhone. Cài PWA vẫn cần thao tác xác nhận trong trình duyệt.
- Dữ liệu riêng/API/OAuth không được cache offline. Khi mất mạng, ứng dụng thông báo rõ thay vì giả vờ lưu thành công.

## Cập nhật bản trên Windows

Gói tải xuống `tubeflow-creator-workspace.zip` chứa source, cấu hình build, asset, hướng dẫn và test; không chứa node_modules, .next, .git, .env, .env.local hoặc database.

1. Sao lưu/commit dự án hiện tại.
2. Giải nén vào một thư mục riêng để đối chiếu trước khi thay source.
3. Giữ nguyên `.env` / `.env.local` của bản triển khai. Đặc biệt không đổi `YOUTUBE_TOKEN_SECRET` khi vẫn cần giải mã token YouTube đã kết nối.
4. Chạy `npm install` trong thư mục dự án sau khi cập nhật.
5. Bản giao diện này không yêu cầu reset database. Nếu chưa áp dụng bản sửa bảng `public_channels` trước đó, dùng `npx drizzle-kit push` và kiểm tra thay đổi trước khi xác nhận. Không drop/truncate database.
6. Kiểm tra lần lượt: `npx next typegen`, `npm exec tsc -- --noEmit --pretty false`, `npm run build`.
7. Triển khai lại theo quy trình đang dùng. Trong PWA đã cài, lưu nội dung rồi chọn cập nhật khi có thông báo. Nếu cần, đóng/mở lại ứng dụng để trình duyệt kiểm tra service worker mới.

Thay đổi trong sandbox/preview không tự push lên GitHub hoặc thay file ở C:\Projects\youtubeflow.

## Kiểm thử giao diện mới

- `node tests/workspace-responsive.mjs` chạy trên production server đã khởi động.
- Cần cài trình duyệt kiểm thử bằng `npx playwright install chromium` (và thư viện hệ thống Playwright tương ứng trên Linux).
- Script kiểm tra 10 màn hình ở 1440, 1280, 1024, 768, 390, 360 và 320px; tạo và xoá một kế hoạch thử nghiệm qua API thật; kiểm tra lịch, tìm kiếm, tạo nhanh, canvas, crop, deep link và accessibility.
- Trạng thái PWA standalone được mô phỏng trong trình duyệt kiểm thử, không thay thế kiểm tra trên điện thoại vật lý.
- Kiểm thử API hiện có: `node tests/studio.mjs` và `node tests/strategy.mjs`.
- Ảnh chụp và báo cáo kiểm tra nằm trong `artifacts/` trên môi trường chạy test, không có trong gói source tải xuống.

Không có thay đổi nào tự đăng video, cấp quyền Google hoặc khẳng định chắc chắn nội dung tuân thủ mọi chính sách. Các thao tác xuất bản vẫn cần người dùng xác nhận và cấu hình OAuth hợp lệ.
