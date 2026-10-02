# DNS Status Board

Trang tĩnh chạy trên Cloudflare Pages, dùng để kiểm tra bản ghi DNS của một danh sách domain và hiển thị trạng thái hiện tại của từng domain.

## Tính năng

- Dán danh sách domain, mỗi dòng một tên miền. Chấp nhận cả URL dán nguyên (`https://host:443/path` sẽ được rút về `host`).
- Đối chiếu giá trị mong đợi bằng cú pháp `domain = giá trị`, nhiều giá trị ngăn bằng dấu phẩy. Domain nào trả về khác mong đợi sẽ được đánh dấu **Sai giá trị**, rất tiện khi theo dõi một đợt chuyển DNS.
- Chọn nhiều loại bản ghi cùng lúc: A, AAAA, CNAME, MX, NS, TXT, CAA, SOA.
- Chọn resolver: Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9, AdGuard, hoặc đi qua Pages Function `/api/dns`.
- Truy vấn song song có giới hạn, timeout cấu hình được, nút dừng giữa chừng.
- Dải tổng hợp đếm theo trạng thái, bấm vào để lọc bảng. Ô tìm kiếm lọc theo tên miền hoặc giá trị bản ghi.
- Mở rộng từng dòng để xem đầy đủ bản ghi, TTL, rcode, SOA khi NXDOMAIN, cờ DNSSEC AD.
- Nút **So sánh 4 resolver** trong phần chi tiết: hỏi cùng một bản ghi ở bốn resolver và cho biết chúng có đồng nhất không. Đây là cách nhanh nhất để thấy DNS đã lan truyền hay chưa.
- Tự động chạy lại theo chu kỳ 30 giây đến 15 phút.
- Xuất CSV hoặc JSON, sao chép vào clipboard hoặc tải file.
- Giao diện sáng/tối, lưu danh sách và cấu hình vào `localStorage` của trình duyệt.

## Trạng thái hiển thị

| Trạng thái | Ý nghĩa |
|---|---|
| Hoạt động | Resolver trả về NOERROR kèm ít nhất một bản ghi |
| Sai giá trị | Có bản ghi nhưng không khớp giá trị mong đợi đã khai báo |
| Không bản ghi | NOERROR nhưng không có bản ghi nào cho loại đã chọn (NODATA) |
| NXDOMAIN | Tên miền không tồn tại |
| Lỗi DNS | SERVFAIL, REFUSED hoặc rcode khác |
| Không gọi được | Lỗi mạng, bị chặn, hoặc quá thời gian chờ |

## Cấu trúc

```
dns-status-page/
├── index.html            Toàn bộ giao diện và logic truy vấn DoH
├── functions/
│   └── api/
│       └── dns.js        Pages Function proxy tới các resolver công cộng
├── _headers              Security header và CSP
└── README.md
```

## Deploy

### Cách 1 — Wrangler (nhanh nhất)

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy dns-status-page --project-name dns-status
```

Lần đầu Wrangler sẽ hỏi tạo project mới. Sau đó mỗi lần deploy lại chỉ cần chạy lại lệnh trên.

### Cách 2 — Kết nối Git

1. Đẩy thư mục này lên một repo GitHub hoặc GitLab.
2. Trong Cloudflare Dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - Framework preset: `None`
   - Build command: để trống
   - Build output directory: `/` (hoặc `dns-status-page` nếu repo chứa nhiều thư mục)
4. Deploy. Cloudflare tự nhận thư mục `functions/` và publish route `/api/dns`.

### Chạy thử tại máy

```bash
npx wrangler pages dev dns-status-page
```

Lệnh này chạy cả trang tĩnh lẫn Pages Function, nên tuỳ chọn resolver `/api/dns` hoạt động được ngay tại local. Nếu chỉ mở `index.html` bằng `file://` hoặc một HTTP server tĩnh, bốn resolver công cộng vẫn chạy bình thường vì chúng đều bật CORS, chỉ riêng `/api/dns` là không có.

## Pages Function `/api/dns`

```
GET /api/dns?name=example.com&type=A&resolver=cloudflare
```

| Tham số | Giá trị | Mặc định |
|---|---|---|
| `name` | tên miền, bắt buộc, được kiểm tra bằng regex trước khi chuyển tiếp | — |
| `type` | A, AAAA, CNAME, MX, NS, TXT, SOA, PTR, SRV, CAA, DS, DNSKEY, TLSA, SVCB, HTTPS, NAPTR | `A` |
| `resolver` | cloudflare, google, quad9, adguard | `cloudflare` |
| `cd` | `1` để tắt kiểm tra DNSSEC | tắt |

Hàm trả về nguyên dạng JSON của resolver, thêm hai trường `_resolver` và `_upstream_ms`. Kết quả được cache tại edge 30 giây để nhiều người cùng mở trang không tạo ra nhiều truy vấn trùng nhau.

## Giới hạn cần biết

- DoH trả về kết quả từ cache của resolver công cộng, không phải từ authoritative name server. Khi cần xác nhận bản ghi đã được cập nhật tại nguồn, hỏi thẳng NS của domain bằng `dig @ns1.example.com example.com A`.
- Danh sách rất dài nên giảm số truy vấn song song xuống 4 đến 6, vì các resolver công cộng đều có rate limit theo IP.
- Chỉ dùng được các loại bản ghi mà JSON API của resolver hỗ trợ. Những loại hiếm như HTTPS/SVCB có thể trả về dạng chuỗi thô tuỳ resolver.
