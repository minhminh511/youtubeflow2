# TubeFlow: sửa lỗi export của đồng bộ YouTube công khai

## Phạm vi

Bản vá xử lý hai lỗi TypeScript:

- TS2305: `@/db/schema` không export `publicChannels`.
- TS2459: `@/lib/youtube` khai báo `mapVideo` nhưng không export.

Các file được thay đổi:

1. `src/db/schema.ts`: thêm named export `publicChannels` ánh xạ bảng `public_channels`, cùng các kiểu insert/select. Bảng cache dữ liệu công khai theo workspace, không chứa OAuth token.
2. `src/lib/youtube.ts`: export `mapVideo` và kiểu đầu vào `GoogleVideo`; không thay đổi logic upload, OAuth hoặc ánh xạ dữ liệu.
3. `tests/contracts/youtube-public-imports.ts`: kiểm tra compile-time đúng hai import bị lỗi và kiểu dữ liệu dùng để ghi vào Drizzle.

Không thay package.json, không tắt TypeScript, không dùng `any`, không xoá bảng hay dữ liệu hiện có.

## Áp dụng trên Windows

Giải nén `youtubeflow-public-sync-fix.zip`. Copy file `youtubeflow-public-sync-fix.patch` vào thư mục gốc dự án, cạnh `package.json`.

Trong Command Prompt hoặc PowerShell, tại `C:\Projects\youtubeflow`:

1. Lưu/commit các thay đổi hiện tại trước khi áp dụng.
2. Kiểm tra bản vá có khớp bộ file của bạn:

   `git apply --check youtubeflow-public-sync-fix.patch`

3. Chỉ khi bước kiểm tra không báo lỗi, áp dụng:

   `git apply youtubeflow-public-sync-fix.patch`

4. Tạo bảng mới trong PostgreSQL bằng cấu hình DATABASE_URL của dự án:

   `npx drizzle-kit push`

5. Chạy kiểm tra lần lượt:

   `npx next typegen`

   `npm exec tsc -- --noEmit --pretty false`

   `npm run build`

Nếu `git apply --check` báo không khớp hoặc bản vá đã được áp dụng, dừng ở đó; không dùng tuỳ chọn ép ghi đè. Bản vá bổ sung bảng, không cần reset database, xoá dữ liệu, cài lại dependency hay tắt kiểm tra build.

## Lưu ý về khác biệt giữa các phiên bản

Tại thời điểm đối chiếu, HEAD của repo GitHub được cung cấp chưa có `src/lib/youtube-public.ts`. File này xuất hiện trong log Windows nhưng không có trong repo hoặc workspace. Vì vậy bản sửa xác minh các export dùng chung và một module kiểm tra đúng các import đó; không khẳng định đã kiểm tra toàn bộ nội dung file `youtube-public.ts` riêng trên máy của bạn.

Thay đổi trong preview/workspace không tự push lên GitHub hoặc tự sửa file trên ổ C:. Cần áp dụng bản vá vào đúng bản local đang build.

## Kiểm tra dữ liệu

Bảng `public_channels` có khoá workspace, thông tin kênh công khai, thông tin playlist upload và timestamp đồng bộ. Insert, upsert và quan hệ cascade được kiểm tra trong một transaction rollback; dữ liệu cũ không bị thay đổi. `youtube_connections` tiếp tục quản lý OAuth riêng biệt.
