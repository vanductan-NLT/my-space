# Review UI/UX + tính năng — Write mode (so với Notion)

Ngày: 2026-10-19 · Cách review: chạy `npm run dev`, bấm thật trong browser (desktop 1366×820 dark/light, mobile 375×812), đọc code `src/components/write/*`.

## Lỗi UI/UX phát hiện khi bấm thử

| # | Mức | Vấn đề | Nguyên nhân |
|---|-----|--------|-------------|
| 1 | Nghiêm trọng | Dark mode: sidebar Documents nền sáng `#f7f7f5`, chữ trắng → gần như không đọc được ("Documents", tên tài liệu) | `.documents` dùng `var(--surface-dim, #f7f7f5)` — biến không tồn tại nên rơi về màu sáng; hover/active cũng hard-code `rgba(0,0,0,…)` |
| 2 | Cao | Tên tài liệu bị cắt cụt "Welcome t…" dù sidebar còn chỗ | 4 nút hành động (move/pin/duplicate/delete) `opacity:0` nhưng vẫn chiếm chiều ngang |
| 3 | Cao | Quá nhiều nút trên mỗi dòng + dòng 2 (thời gian · preview) gây rối, khác Notion | Thiết kế row 2 dòng + 4 icon |
| 4 | Trung bình | Khoảng trống lớn giữa tiêu đề trang và heading đầu tiên | `h1 { margin-top: 1.6em }` áp cả cho block đầu |
| 5 | Trung bình | Không thoát được callout/bảng/ảnh khi nó là block cuối; click vùng trống dưới nội dung không đưa con trỏ xuống cuối | Không có trailing paragraph |
| 6 | Trung bình | Tiêu đề dài không xuống dòng | Tiêu đề là `<input>` 1 dòng |
| 7 | Thấp | Modal xoá thư mục có câu tiếng Việt hard-code (không theo ngôn ngữ), placeholder "e.g. Work…" không dịch | Chuỗi viết thẳng trong JSX |
| 8 | Thấp | Header nhiều icon rời rạc; breadcrumb nằm trong trang chiếm chỗ | Bố cục |

## Thiếu so với Notion (ưu tiên theo giá trị / chi phí)

1. **Icon trang (emoji)** — model đã có `icon` nhưng UI không dùng.
2. **Thùng rác (Trash)** — xoá hiện là xoá vĩnh viễn; Notion cho khôi phục + Undo.
3. **Quick Find (Ctrl+P)** — nhảy nhanh giữa các trang.
4. **Block handle `+` / `⋮⋮`** — kéo thả sắp xếp block, menu block (chuyển thành / nhân bản / xoá / di chuyển), phím Alt+Shift+↑↓.
5. **Toggle list** (khối thu gọn được).
6. **Full width** cho từng trang + menu `⋯` của trang (gộp Export, Pin, Duplicate, Move, Trash).
7. **Mục Favorites** (trang đã ghim) trên sidebar.

Ngoài phạm vi lần này: trang lồng trang (sub-pages), database/board view, @mention trang, cover image, đồng bộ cloud.

## Câu hỏi còn mở
- Có muốn trang lồng nhau (sub-pages) thay cho thư mục không? Ảnh hưởng schema + backup format.
