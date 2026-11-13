# Kết nối TikTok với TubeFlow

## 1. Tạo ứng dụng trên TikTok for Developers
1. Đăng nhập tại developers.tiktok.com → **Manage apps → Create new app**.
2. Thêm sản phẩm **Login Kit** và **Content Posting API**.
3. Trong phần Scopes, bật: `user.info.basic`, `video.list`, `video.publish`, `video.upload`.
4. Ghi lại **Client Key** và **Client Secret**.

## 2. Cấu hình .env (không đưa vào Git)
```
TIKTOK_CLIENT_KEY=<Client Key>
TIKTOK_CLIENT_SECRET=<Client Secret>
APP_URL=https://<địa chỉ HTTPS của bạn>
```
Giữ nguyên `YOUTUBE_TOKEN_SECRET`; token TikTok được mã hoá bằng khoá này.

## 3. Redirect URI
Thêm đúng URI dưới đây vào cấu hình ứng dụng TikTok:
`<APP_URL>/api/tiktok/callback`

## 4. Những điều cần biết trước khi dùng
- **Token chỉ sống 24 giờ.** TubeFlow tự làm mới bằng refresh token (hạn 365 ngày) và lưu token mới ngay khi nhận; nếu refresh token hết hạn, kết nối lại.
- **Kiểm duyệt ứng dụng:** ứng dụng chưa qua kiểm duyệt của TikTok sẽ bị ép đăng ở chế độ **Chỉ mình tôi**. Muốn đăng công khai, gửi ứng dụng qua quy trình kiểm duyệt của TikTok.
- **Hai luồng đăng khác nhau:**
  - `video.publish` — Đăng thẳng lên hồ sơ (Direct Post).
  - `video.upload` — Gửi vào hộp thư TikTok để bạn tự hoàn tất trong ứng dụng.
  Đây là hai phạm vi riêng biệt; có cái này không có nghĩa có cái kia.
- **Giới hạn:** khoảng 15 bài đăng thẳng/ngày và 5 bản nháp chờ/ngày cho mỗi tài khoản.
- **Định dạng:** TikTok chỉ nhận video (không nhận ảnh lẻ qua API này). Khuyến nghị MP4, dọc 9:16, tối thiểu 720p, từ 3 giây trở lên.

## 5. Luồng đăng của TubeFlow
1. `POST /v2/post/publish/video/init/` để tạo phiên đăng và nhận `upload_url`.
2. `PUT` trực tiếp file video lên `upload_url` kèm header `Content-Range`.
3. `POST /v2/post/publish/status/fetch/` để kiểm tra trạng thái: `PUBLISH_COMPLETE`, `SENT_TO_REVIEW`, `PROCESSING` hoặc `FAILED`.

TubeFlow lưu lại kết quả trong tab **Lịch sử** và có nút kiểm tra trạng thái thủ công, vì TikTok xử lý và kiểm duyệt nội dung bất đồng bộ.

## 6. Kiểm tra trước khi đăng
Tab **Soạn & đăng** chấm điểm theo Nguyên tắc cộng đồng của TikTok và mức độ sẵn sàng lên xu hướng. Đây là bước sàng lọc sớm dựa trên các luật công bố; **quyết định cuối cùng thuộc về TikTok**.

Các lỗi bị chặn ngay ở máy chủ: nội dung người lớn, bạo lực, thù ghét, quấy rối, hành vi nguy hiểm, thông tin sai lệch, gian lận tương tác, nội dung liên quan trẻ em, hoạt động bất hợp pháp.

## 7. Kiểm tra ứng dụng
1. Khởi động lại máy chủ sau khi sửa `.env`.
2. Mở TubeFlow → **Kết nối kênh** → **Kết nối TikTok**.
3. Chọn **Soạn & đăng**, tải một video và kiểm tra điểm tuân thủ trước khi gửi.

## 8. Lỗi "client_key" khi đăng nhập TikTok

TikTok hiển thị trang *"Chúng tôi không thể đăng nhập bằng TikTok… client_key"* khi giá trị `client_key` gửi lên không hợp lệ. Đây là lỗi cấu hình khoá, không phải lỗi mạng. Kiểm tra theo thứ tự:

1. **Đúng tab Sandbox/Production.** TikTok for Developers có hai tab, mỗi tab một cặp khoá khác nhau. Client Key phải cùng tab với Redirect URI bạn đã khai báo. Khoá Sandbox chỉ cho tài khoản thử nghiệm đã thêm đăng nhập được.
2. **Đúng loại khoá.** Client Key không phải App ID (chuỗi số) và không phải Client Secret.
3. **Không có ký tự lạ.** Không dấu nháy, không xuống dòng, không khoảng trắng khi dán. TubeFlow đã tự lọc BOM/nháy/khoảng trắng, nhưng nên kiểm tra lại nguồn.
4. **Không bị ghi đè.** `TIKTOK_CLIENT_KEY` trong `.env.local` sẽ ghi đè `.env` của Next.js.
5. **Redirect URI khớp tuyệt đối** với `<APP_URL>/api/tiktok/callback`, kể cả dấu `/` cuối và giao thức HTTPS.
6. **Khởi động lại máy chủ** sau khi sửa `.env`.

TubeFlow kiểm tra khoá trước khi chuyển sang TikTok: trang **Kết nối kênh → TikTok** hiển thị phần **Chẩn đoán cấu hình** nêu rõ khoá có đang là placeholder, App ID, chứa ký tự lạ, hay có dấu hiệu là khoá Sandbox. Nếu vẫn lỗi, gửi mã log TikTok (ví dụ `20261112180110E4ED3815D752F057064E`) cho bộ phận hỗ trợ TikTok kèm thời điểm bạn thử.

## 9. "client_key" / "đã xảy ra lỗi": kiểm tra theo đúng thứ tự này

Hai loại lỗi khác nhau, đừng nhầm:

| TikTok hiển thị | Nghĩa là | Cách sửa |
| --- | --- | --- |
| `client_key` hoặc `unauthorized_client` | TikTok không nhận giá trị khoá | Dùng đúng khoá của tab đang dùng (Sandbox/Production), chép mới từ **Basic information → Credentials** |
| `redirect_uri`, `errCode 10006` | Khoá đúng nhưng URI chưa khớp | Dán lại đúng `<APP_URL>/api/tiktok/callback`, cùng giao thức và dấu `/` |

### Tài khoản developer và tài khoản TikTok có cần trùng email không?

**Không.** Đây là hai danh tính riêng:

- **Tài khoản developer** (email) chỉ dùng để đăng nhập cổng developers.tiktok.com và tạo ứng dụng.
- **Tài khoản TikTok** (số điện thoại hay email) là tài khoản sẽ cấp quyền cho TubeFlow.

Chúng không bắt buộc cùng email. Nhưng nếu ứng dụng đang ở chế độ **Sandbox**, thì **tài khoản TikTok đó phải được thêm vào Target users**: Sandbox settings → Target users → **Add account** → đăng nhập bằng chính tài khoản TikTok (bằng số điện thoại cũng được). Tối đa 10 tài khoản. TikTok ghi rõ: ứng dụng Sandbox **chỉ** cho các tài khoản nằm trong Target users đăng nhập.

### Vì sao khoá Production lại gây lỗi `client_key`

Theo tài liệu và báo cáo thực tế, dùng **khoá Production khi ứng dụng chưa được TikTok duyệt** chính là nguyên nhân phổ biến nhất của lỗi `client_key` / `unauthorized_client`. Cách xử lý:

1. Tạo **Sandbox** (tối đa 5 sandbox), thêm Login Kit và Content Posting API, khai Redirect URI trong tab Sandbox.
2. Thêm tài khoản TikTok của bạn vào **Target users**.
3. Lấy **Client Key / Client Secret của tab Sandbox**, không dùng tab Production.
4. Ghép cặp đúng: khoá và secret phải cùng một tab.
5. Sau khi TikTok duyệt ứng dụng, chuyển sang khoá Production.

### Vị trí lấy khoá

**Manage apps → chọn ứng dụng → Basic information → Credentials → biểu tượng con mắt.** Trang `/portal/organizations` chỉ quản lý tổ chức/thành viên, không hiển thị Client Key của ứng dụng.

### Giới hạn scope

`user.info.basic` được TikTok thêm sẵn cho mọi ứng dụng. Các scope khác (`video.list`, `video.publish`, `video.upload`) phải được thêm trong mục **Scopes** của ứng dụng. Yêu cầu một scope chưa được cấp có thể làm trang uỷ quyền báo lỗi.

TubeFlow mặc định chỉ yêu cầu `user.info.basic` để đăng nhập được trước. Muốn đăng video, thêm vào `.env`:

```
TIKTOK_SCOPES=user.info.basic,video.list,video.publish,video.upload
```

Nếu đăng nhập vẫn lỗi, hãy bỏ dòng này để quay về mức tối thiểu, xác nhận đăng nhập được, rồi mới thêm lại từng scope.

## 10. Redirect URI: phải là URL đầy đủ, không phải tên miền gốc

TikTok Login Kit yêu cầu **URL đầy đủ** (giao thức + đường dẫn) và phải **khớp từng ký tự** với giá trị TubeFlow gửi đi.

**Sai (chỉ tên miền gốc):**

```
https://ten-mien-cua-ban.trycloudflare.com/
```

**Đúng (phải có đuôi /api/tiktok/callback):**

```
https://ten-mien-cua-ban.trycloudflare.com/api/tiktok/callback
```

Quy tắc:

1. Nhập vào mục **Products → Login Kit → Redirect URI → Web** (không phải Desktop/Android/iOS).
2. Không có dấu `/` ở cuối, không có khoảng trắng.
3. `APP_URL` trong `.env` phải bằng **phần gốc** của URI đó, ví dụ `https://ten-mien.trycloudflare.com`.
4. Nếu bạn đổi `APP_URL` (ví dụ tunnel mới), phải sửa cả Redirect URI trong TikTok rồi khởi động lại máy chủ.
5. TikTok cho thêm tối đa 10 Redirect URI — có thể khai cả bản localhost để thử cục bộ.

### Cloudflare Quick Tunnel

Tên miền `*.trycloudflare.com` **đổi mỗi lần chạy lại** `cloudflared`. Vì TikTok kiểm tra khớp tuyệt đối, mỗi lần đổi tên miền bạn phải cập nhật lại cả hai nơi. Khi thử nhiều lần, dùng **Named Tunnel** với tên miền cố định để tránh lặp lại việc này.

### Hai lỗi khác nhau

| TikTok báo | Nguyên nhân |
| --- | --- |
| `redirect_uri` / `errCode 10006` | URI chưa khớp tuyệt đối (thiếu đường dẫn, sai giao thức, dư dấu `/`, tunnel đã đổi tên miền) |
| `client_key` / `unauthorized_client` | Khoá sai nguồn: dùng khoá Production khi app chưa duyệt, lấy khoá Sandbox nhưng khai URI ở Production, hoặc chép App ID |

## 11. TikTok bắt xác thực tên miền ("URL properties")

Ở chế độ **Production**, TikTok chỉ cho thêm Redirect URI sau khi bạn **xác thực quyền sở hữu tên miền**. Đây là bước riêng, không liên quan tới `client_key`.

### Vì sao `*.trycloudflare.com` không xác thực được

Bạn không sở hữu tên miền `trycloudflare.com`, nên không thể tạo bản ghi DNS TXT cho nó và cũng không kiểm soát được đường dẫn gốc để đặt tệp xác thực. TikTok ghi rõ những trường hợp tương tự (ví dụ `*.s3.amazonaws.com`) **không thể xác thực**.

### Ba cách đi tiếp

**Cách 1 — Sandbox (nhanh nhất để thử đăng nhập).**
Tài liệu TikTok: *"For Sandbox environments, URL verification is only required for Content Posting API."* Nghĩa là Login Kit trong Sandbox **không** bắt xác thực URL. Tạo Sandbox của ứng dụng, dùng **Client Key/Secret của tab Sandbox**, khai Redirect URI trong tab Sandbox, và thêm tài khoản TikTok của bạn vào **Target users**.

**Cách 2 — Tên miền riêng (đúng cho chạy thật).**
1. Mua một tên miền bạn sở hữu.
2. Trỏ tên miền vào máy chạy TubeFlow bằng **Cloudflare Named Tunnel** (tên miền cố định, khác Quick Tunnel).
3. TikTok → **URL properties** → **Verify properties** → chọn **Domain** → nhập tên miền → thêm bản ghi **DNS TXT** mà TikTok cấp → bấm **Verify**.
4. Đặt `APP_URL` là tên miền đó, thêm Redirect URI `https://tenmien-cua-ban.com/api/tiktok/callback`, khởi động lại.

**Cách 3 — Xác thực bằng tệp (khi không sửa được DNS).**
1. TikTok → **Verify properties** → **URL prefix** → nhập URL đầy đủ cần xác thực.
2. Tải tệp xác thực TikTok cấp.
3. Dán nội dung tệp vào `.env`: `TIKTOK_SITE_VERIFICATION=<nội dung tệp>`.
4. TubeFlow tự phục vụ tệp tại `/tiktok-developers-site-verification.txt`, không cần chép file lên host.
5. Bấm **Verify** trong TikTok.

### Nếu ứng dụng chạy qua tunnel nhưng TikTok cần tên miền đã xác thực

Đặt `TIKTOK_REDIRECT_URI` để tách callback khỏi `APP_URL`:

```
APP_URL=https://tunnel-hien-tai.trycloudflare.com
TIKTOK_REDIRECT_URI=https://tenmien-cua-ban.com/api/tiktok/callback
```

Khi đó đường dẫn gửi TikTok và dùng để đổi token là tên miền đã xác thực. Tên miền đó vẫn phải trỏ về máy chủ TubeFlow, nếu không bước đổi token sẽ thất bại.

## 12. Xác thực bằng "URL prefix" — từng bước

Cách này dùng khi bạn **không sửa được DNS** của tên miền. TikTok sẽ tự tải một tệp từ chính máy chủ TubeFlow để chứng minh bạn kiểm soát URL đó.

### Bước 1 — Lấy chữ ký trong TikTok
1. TikTok for Developers → ứng dụng → nút **URL properties** (góc trên).
2. Bấm **Verify properties** → chọn **URL prefix**.
3. Nhập URL prefix. Với tunnel hiện tại:
   ```
   https://ten-mien-cua-ban.trycloudflare.com/
   ```
   Phải có `https://` và **dấu `/` ở cuối**.
4. TikTok hiện **một chữ ký** (và có thể cho tải tệp). Ghi lại chữ ký.

### Bước 2 — Đưa chữ ký vào máy chủ
Thêm vào `.env`:
```
TIKTOK_SITE_VERIFICATION=tiktok-developers-site-verification=<chữ ký>
```
Hoặc chỉ cần dán **riêng phần chữ ký** — TubeFlow tự ghép đúng nội dung.

Khởi động lại máy chủ. Không cần tạo tệp, không cần chép file lên host.

### Bước 3 — Đường dẫn TikTok thật sự tải
TikTok **không** tải `tiktok-developers-site-verification.txt`. Tên tệp chứa chính chữ ký:

```
https://<tên-miền>/tiktok<chữ ký>.txt
```

Ví dụ với chữ ký `AbCdEf123456`:
```
https://ten-mien-cua-ban.trycloudflare.com/tiktokAbCdEf123456.txt
```

Nội dung trả về phải là **đúng một dòng**, không BOM, không thêm chữ:
```
tiktok-developers-site-verification=AbCdEf123456
```

TubeFlow đã xử lý việc này: `next.config.ts` chuyển mọi tệp `tiktok*.txt` ở gốc tên miền về cùng một handler, nên bạn không cần biết trước tên tệp.

### Bước 4 — Kiểm tra rồi bấm Verify
1. Mở URL tệp ở trên bằng trình duyệt (xem đúng một dòng).
2. Kiểm tra qua chính tunnel: `curl https://<tên-miền>/tiktok<chữ ký>.txt`
3. Bấm **Verify** trong TikTok.

### Nếu vẫn thất bại
- **Trả về 404 hoặc trang HTML**: rewrite chưa chạy — kiểm tra `next.config.ts` có mục `rewrites()` và đã khởi động lại.
- **Redirect 3xx**: TikTok coi URL chuyển hướng là không hợp lệ. Kiểm tra tunnel/Cloudflare Access có chặn hoặc chuyển hướng hay không.
- **Không tải được**: Cloudflare Access/WAF đang chặn bot. Tạm tắt cho đường dẫn `.txt`, hoặc dùng Named Tunnel có chứng chỉ hợp lệ.
- **Tên miền dùng chung** (`*.trycloudflare.com`, `*.github.io`…): TikTok có thể từ chối vì không xác minh được quyền sở hữu dù tệp vẫn đọc được. Khi đó phải dùng tên miền riêng.

## 13. Sau khi đã xác thực tên miền — các bước còn lại

Khi mục **URL properties → Verified properties** đã có URL prefix của bạn, phần khó nhất đã xong. Tiếp theo:

### Bước 1 — Thêm Redirect URI (bắt buộc)
**Products → Login Kit → Redirect URI → Web**, dán đúng:
```
<APP_URL>/api/tiktok/callback
```
Ví dụ với tunnel đã xác thực:
```
https://ten-mien-cua-ban.trycloudflare.com/api/tiktok/callback
```
Không có dấu `/` ở cuối. Đây là URL TubeFlow hiển thị sẵn trong khung "Dán CHÍNH XÁC dòng này".

### Bước 2 — Kiểm tra Scopes
**Products → Login Kit → Scopes**: `user.info.basic` có sẵn. Thêm `video.publish`, `video.upload`, `video.list` nếu muốn đăng video. Scopes phải khớp với yêu cầu TubeFlow gửi đi (mặc định chỉ `user.info.basic`).

### Bước 3 — Kết nối và kiểm tra
1. Bấm **Kết nối TikTok** trong TubeFlow.
2. Đăng nhập bằng tài khoản TikTok. Bạn phải là **Quản trị viên** của ứng dụng hoặc nằm trong **Target users** nếu dùng Sandbox.
3. Sau khi quay lại, thẻ TikTok phải hiện tên tài khoản và trạng thái **Đã kết nối**.

### Bước 4 — Gỡ giới hạn "chỉ mình tôi"
Theo tài liệu TikTok, ứng dụng **chưa qua kiểm duyệt** chỉ đăng được ở chế độ **SELF_ONLY**. Muốn đăng công khai, phải gửi ứng dụng đi **review (audit)**. Trong lúc chờ, TubeFlow vẫn cho soạn, kiểm tra chính sách và gửi video (ở chế độ riêng tư) để thử toàn bộ luồng.

### Bước 5 — Kiểm tra trước khi tin tưởng
- Bấm **Kiểm tra khoá**: kết quả `recognized` nghĩa là khoá đúng.
- Soạn một video ngắn, xem điểm chính sách và mức sẵn sàng xu hướng.
- Gửi thử bằng **Gửi vào hộp thư** (nếu có `video.upload`) để chắc chắn luồng tải lên chạy, rồi kiểm tra trong ứng dụng TikTok.

### Nhắc lại về Quick Tunnel
Tên miền `*.trycloudflare.com` đổi mỗi lần chạy lại `cloudflared`. Nếu đổi, bạn phải **xác thực lại URL prefix** và **sửa lại Redirect URI**, nếu không TikTok sẽ báo lỗi. Khi đã chạy ổn, hãy chuyển sang **Named Tunnel** hoặc tên miền riêng để không phải lặp lại.

## 14. Chuyển sang Sandbox (khi app chưa được TikTok duyệt)

TubeFlow **không thể tự chuyển** tab Sandbox/Production trong trang TikTok: môi trường nằm ở chính cặp khoá. Chuyển bằng cách đổi khoá.

### Cách nhận biết
- Khoá **Sandbox** thường bắt đầu bằng `sb`.
- Khoá **Production** bắt đầu bằng `aw`.
- TubeFlow hiển thị chế độ phát hiện được ở đầu thẻ chẩn đoán TikTok.

### Các bước chuyển
1. TikTok for Developers → gạt công tắc ứng dụng sang **Sandbox** → mở tab Sandbox.
2. **Products → Login Kit → Redirect URI → Web**: thêm lại
   `https://<tên-miền>/api/tiktok/callback`
   Đăng ký riêng cho Sandbox, **không dùng chung** với Production.
3. **Sandbox settings → Target users → Add account**: đăng nhập bằng chính tài khoản TikTok của bạn (số điện thoại hay email đều được). Tối đa 10 tài khoản.
4. Sao chép **Client Key** và **Client Secret** của tab Sandbox.
5. Cập nhật `.env`: thay cả hai giá trị (cặp khoá phải cùng một tab):
   ```
   TIKTOK_CLIENT_KEY=sb...
   TIKTOK_CLIENT_SECRET=...
   ```
   Giữ `TIKTOK_REDIRECT_URI` trỏ đúng tên miền đã xác thực.
6. Khởi động lại máy chủ → bấm **Kết nối TikTok**.

### Lưu ý ở Sandbox
- TikTok **không** bắt xác thực URL cho Login Kit trong Sandbox (chỉ Content Posting API mới cần).
- Ứng dụng chưa qua kiểm duyệt chỉ đăng được ở chế độ **"Chỉ mình tôi"**.
- Không trộn khoá Sandbox với Redirect URI của Production (hoặc ngược lại) — đây là nguyên nhân phổ biến của lỗi `client_key`.

### Khi nào quay lại Production
Sau khi TikTok duyệt ứng dụng: gạt về Production, dùng lại cặp khoá `aw…`, khai Redirect URI trong tab Production, và giữ nguyên tên miền đã xác thực.

## 15. Lỗi sau khi bấm "Tiếp tục" ở trang cấp quyền TikTok

Nếu bạn **đã thấy** màn hình "TubeFlow (Sandbox) muốn có quyền truy cập…" thì chứng tỏ Client Key và Redirect URI đã đúng. Lỗi còn lại nằm ở bước đổi token hoặc đọc thông tin tài khoản.

TubeFlow giờ hiển thị **nguyên văn thông điệp lỗi** trong thẻ "Lần kết nối gần nhất thất bại" để bạn biết chính xác.

### Nguyên nhân thường gặp

| Thông điệp | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Mã uỷ quyền hết hạn/đã dùng | Mỗi `code` chỉ dùng một lần, sống vài phút | Đóng tab TikTok cũ, bấm Kết nối TikTok lại từ đầu |
| Không đổi được mã xác thực | Cặp khoá khác tab, hoặc `redirect_uri` lệch | Dùng khoá và Redirect URI của **cùng một tab** |
| Không đọc được thông tin tài khoản | Ứng dụng thiếu scope, hoặc xin field ngoài quyền | Giữ `TIKTOK_SCOPES` mặc định (`user.info.basic`); thêm scope khác trước khi xin field tương ứng |

### Lỗi đã được sửa trong bản này

`/v2/user/info/` của TikTok **trả lỗi** khi bạn xin một field mà token không có scope tương ứng. Trước đây TubeFlow luôn xin cả `username`, `follower_count`, `likes_count`… nên khi Sandbox chỉ có `user.info.basic`, toàn bộ kết nối thất bại.

Bản này chia field theo scope và **chỉ xin những gì đã được cấp**:

- `user.info.basic` → `open_id`, `union_id`, `avatar_url`, `display_name`
- `user.info.profile` → `username`, `bio_description`, `profile_deep_link`, `is_verified`
- `user.info.stats` → `follower_count`, `following_count`, `likes_count`, `video_count`

Nhóm tuỳ chọn được gọi trong `try/catch`: nếu TikTok không trả, kết nối **vẫn thành công** với thông tin cơ bản.

## 16. "The request parameters are malformed" khi đổi mã uỷ quyền

Đây là thông điệp TikTok trả về từ endpoint đổi token. Quan trọng: TikTok dùng **cùng một câu** cho hai trường hợp rất khác nhau.

| Trường hợp | Cách nhận biết |
| --- | --- |
| Cặp Client Key / Secret không được TikTok nhận ra | Bấm **Kiểm chứng cặp Client Key / Secret** → kết quả `pair_not_recognized` |
| Ứng dụng chưa bật luồng `client_credentials` | Cùng nút đó nhưng kết quả `inconclusive` |

### Nguyên nhân phổ biến nhất: Secret đã tạo lại nhưng .env chưa cập nhật

Nếu bạn **Regenerate Client Secret** trong TikTok for Developers (ví dụ sau khi lộ khoá), secret cũ trong `.env` mất hiệu lực ngay. TikTok nhận `client_key` đúng nhưng `client_secret` sai → trả "malformed". Hãy chép lại secret mới.

### Nguyên nhân thứ hai: trộn khoá giữa hai tab

Client Key ở tab Sandbox nhưng Client Secret ở tab Production (hoặc ngược lại) sẽ tạo ra một cặp không tồn tại. Kiểm tra tiền tố: Sandbox thường bắt đầu `sb`, Production bằng `aw` — **cả hai phải cùng tiền tố nhóm**.

### Nguyên nhân thứ ba: ký tự lạ khi dán

Dấu nháy, BOM, hoặc xuống dòng giữa chừng. TubeFlow đã tự lọc, nhưng hãy dán lại từ nguồn sạch.

### Cách kiểm tra nhanh

1. Mở **Kết nối kênh → TikTok → Kiểm chứng cặp Client Key / Secret**.
2. So 4 ký tự đầu/cuối của Client Key và Client Secret hiển thị trên màn hình với trang TikTok for Developers.
3. Nếu lệch → chép lại đúng cặp.
4. Nếu khớp mà vẫn `pair_not_recognized` → gửi `log_id` (TubeFlow hiển thị nếu TikTok trả về) cho hỗ trợ TikTok.

Lưu ý: mỗi `code` uỷ quyền chỉ dùng **một lần**. Sau khi sửa `.env`, hãy khởi động lại và bấm Kết nối TikTok **lại từ đầu**, đừng dùng lại tab TikTok cũ.

## 17. "invalid_request: The request parameters are malformed" (có log_id) ở bước đổi token

Đây là lỗi **của endpoint đổi token**, không phải mã uỷ quyền bị từ chối. Bản trước phân loại nhầm thành "mã uỷ quyền bị từ chối" — đã sửa.

### Bản này đã sửa gì

1. **Khôi phục dấu `+` trong mã uỷ quyền.** `URLSearchParams` giải mã `+` thành khoảng trắng. Nếu mã TikTok chứa `+` và không được mã hoá, mã bị hỏng trước khi gửi đi → TikTok trả "malformed". TubeFlow giờ phát hiện khoảng trắng và khôi phục thành `+`, đồng thời ghi rõ trong trace.
2. **Phân loại đúng.** `invalid_request / malformed` được tách riêng khỏi `invalid_grant` (mã bị từ chối). Thông báo giờ nói đúng bản chất vấn đề.
3. **Trace minh bạch.** Thông báo kèm: độ dài mã (và dấu `+` có được khôi phục không), `redirect_uri` đã gửi, `scope`, tiền tố khoá. Nhờ vậy có thể phân biệt lỗi do mã, do redirect hay do cặp khoá.

### Thứ tự kiểm tra khi gặp lỗi này

1. Bấm **Kiểm chứng cặp Client Key / Secret**:
   - `pair_not_recognized` → cặp khoá sai. Chép lại **cả hai** giá trị từ cùng một tab.
   - `recognized` → khoá đúng, vấn đề ở phần khác.
2. Xem trace trong thông báo:
   - `code=… (đã khôi phục dấu +)` → mã đã được sửa; nếu vẫn lỗi, nghi vấn chuyển sang secret.
   - `redirect_uri=` phải khớp **tuyệt đối** với URI trong Login Kit.
3. Nếu bạn đã Regenerate Client Secret, chắc chắn `.env` đã cập nhật secret mới rồi khởi động lại.
4. Gửi `log_id` cho hỗ trợ TikTok nếu đã kiểm tra hết — họ tra được chính xác request nào bị từ chối.

## 18. Sau khi kết nối thành công — làm gì tiếp

Bạn đã thấy "Đã kết nối TikTok". Dưới đây là những việc tiếp theo và những giới hạn cần biết.

### 1. Tích các bước đã làm trong checklist
Thẻ TikTok có khối **"Tiến độ bật TikTok"**. Ba mục đầu (Client Key, xác thực tên miền, Redirect URI) do TikTok quản lý nên bạn tự tích bằng nút **"Đã làm"**. Hai mục sau tự động: *Đăng nhập thành công* và *Có quyền đăng trực tiếp*.

### 2. Thêm scope để thấy số liệu thật
TubeFlow chỉ xin field thuộc scope đã cấp. Với **`user.info.basic`**, TikTok chỉ trả `open_id`, `display_name`, `avatar_url` — **không** trả số người theo dõi, lượt thích, số video. Vì vậy thẻ có thể hiện `0 người theo dõi`.

Muốn thấy số liệu: TikTok for Developers → **Scopes** → thêm `user.info.profile` và `user.info.stats`, kết nối lại. TubeFlow tự xin thêm field tương ứng khi thấy scope mới.

### 3. Giới hạn quan trọng: ứng dụng chưa kiểm duyệt
Theo tài liệu TikTok, ứng dụng **chưa qua review** chỉ đăng được ở chế độ **"Chỉ mình tôi" (SELF_ONLY)**. Điều này áp dụng kể cả khi bạn đã có scope `video.publish`.

- Dùng chế độ này để **thử toàn bộ luồng**: soạn → kiểm tra chính sách → tải lên → kiểm tra trạng thái.
- Muốn đăng công khai: gửi ứng dụng đi **audit/review** trong TikTok for Developers. Sau khi được duyệt, chọn chế độ hiển thị Công khai.

### 4. Thử luồng đăng video
1. **Facebook/TikTok → TikTok → Soạn & đăng**.
2. Chọn video dọc 9:16, 3–90 giây, dưới 4GB.
3. Viết chú thích, xem điểm chính sách và mức sẵn sàng xu hướng.
4. Chọn **Gửi vào hộp thư** (nếu có `video.upload`) hoặc **Đăng thẳng lên hồ sơ** (nếu có `video.publish`).
5. Tab **Lịch sử** → bấm nút kiểm tra trạng thái để xem TikTok xử lý tới đâu (`PROCESSING` → `SENT_TO_REVIEW` → `PUBLISH_COMPLETE`).

### 5. Token tự làm mới
Access token sống 24 giờ; TubeFlow tự làm mới bằng refresh token (365 ngày) và lưu cặp mới mỗi lần TikTok luân chuyển. Nếu refresh token hết hạn (sau 1 năm hoặc khi bị thu hồi), thẻ sẽ hiện **"Cần kết nối lại"**.

### 6. Lưu ý về tunnel
Nếu `cloudflared` khởi động lại và tên miền đổi, `APP_URL`, Redirect URI và URL prefix đều phải cập nhật. Khi chạy ổn định, hãy dùng **Named Tunnel** hoặc tên miền riêng.
