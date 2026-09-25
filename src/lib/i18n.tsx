'use client'

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/*
 * Interface language (Tiếng Việt / English) for the whole app. English strings
 * are the keys; the Vietnamese table maps them. Missing entries fall back to
 * English. `{name}` placeholders are filled from `vars`; `**bold**` can be
 * rendered with `rich()`. No library: switching is instant, nothing reloads.
 */

export type Lang = 'vi' | 'en'
export const LANG_KEY = 'my-space:lang'

const VI: Record<string, string> = {
  // Shell & navigation
  'Write': 'Viết',
  'Create': 'Vẽ',
  'Work': 'Làm việc',
  'Frame': 'Khung ảnh',
  'Settings': 'Cài đặt',
  'Collapse': 'Thu gọn',
  'Collapse navigation': 'Thu gọn thanh bên',
  'Expand navigation': 'Mở rộng thanh bên',
  'Workspace navigation': 'Điều hướng',
  'Close': 'Đóng',
  'Cancel': 'Huỷ',
  'Delete': 'Xoá',
  'Got it': 'Đã hiểu',
  'Dismiss notification': 'Đóng thông báo',
  'Opening your space…': 'Đang mở không gian của bạn…',
  'Save failed': 'Lưu thất bại',
  'Not saving': 'Không lưu',

  // Settings
  'Language': 'Ngôn ngữ',
  'Appearance': 'Giao diện',
  'Light': 'Sáng',
  'Dark': 'Tối',
  'Match device': 'Theo thiết bị',
  'Accent colour': 'Màu chủ đạo',
  'Any colour': 'Màu tuỳ chọn',
  'Pick any colour': 'Chọn màu bất kỳ',
  'Mint': 'Bạc hà',
  'Sky': 'Trời xanh',
  'Lavender': 'Oải hương',
  'Rose': 'Hồng',
  'Peach': 'Đào',
  'Lemon': 'Chanh',
  'Teal': 'Xanh ngọc',
  'Graphite': 'Than chì',
  'Mascot': 'Linh vật',
  'The little friend in the corner': 'Người bạn nhỏ ở góc màn hình',
  'Encouragement from the mascot': 'Lời động viên từ linh vật',
  'On': 'Bật',
  'Off': 'Tắt',
  'Install app': 'Cài ứng dụng',
  'Open My Space from your home screen': 'Mở My Space từ màn hình chính',
  'Open source': 'Mã nguồn mở',
  'Clone or contribute on GitHub': 'Clone hoặc đóng góp trên GitHub',

  // Install guide
  'Install My Space': 'Cài My Space',
  'Tap the **Share** button in Safari’s toolbar.': 'Chạm nút **Chia sẻ** trên thanh công cụ Safari.',
  'Choose **Add to Home Screen**.': 'Chọn **Thêm vào MH chính**.',
  'Tap **Add**, then open My Space from the new icon.': 'Chạm **Thêm**, rồi mở My Space từ biểu tượng mới.',
  'Open Chrome’s **⋮** menu.': 'Mở menu **⋮** của Chrome.',
  'Choose **Install app** or **Add to Home screen**.': 'Chọn **Cài đặt ứng dụng** hoặc **Thêm vào màn hình chính**.',
  'In Chrome or Edge, click the install icon in the address bar, or open the browser menu.':
    'Trên Chrome hoặc Edge, bấm biểu tượng cài đặt ở thanh địa chỉ, hoặc mở menu trình duyệt.',
  'Choose **Install My Space**. In Safari on Mac: **File → Add to Dock**.':
    'Chọn **Cài đặt My Space**. Trên Safari (Mac): **Tệp → Thêm vào Dock**.',
  'It opens in its own window like an app. Your documents and boards stay in this browser either way.':
    'Nó mở trong cửa sổ riêng như một ứng dụng. Tài liệu và bảng vẽ vẫn nằm trong trình duyệt này.',

  // Mascot
  'Drag me anywhere · tap me': 'Kéo tớ đi đâu cũng được · chạm vào tớ',

  // Write
  'Documents': 'Tài liệu',
  'New': 'Mới',
  'New document': 'Tài liệu mới',
  'Search titles and text…': 'Tìm theo tiêu đề và nội dung…',
  'Search documents': 'Tìm tài liệu',
  'Nothing matches “{query}”.': 'Không có gì khớp với “{query}”.',
  'Duplicate document': 'Nhân bản tài liệu',
  'Duplicate {title}': 'Nhân bản {title}',
  'Delete document': 'Xoá tài liệu',
  'Delete {title}': 'Xoá {title}',
  'Import': 'Nhập',
  'Backup': 'Sao lưu',
  'Stored only in this browser. Back up now and then.': 'Chỉ lưu trong trình duyệt này. Thỉnh thoảng hãy sao lưu nhé.',
  'Hide documents sidebar': 'Ẩn danh sách tài liệu',
  'Show documents sidebar': 'Hiện danh sách tài liệu',
  'Close documents': 'Đóng danh sách tài liệu',
  'Hide sidebar': 'Ẩn thanh bên',
  'Show sidebar': 'Hiện thanh bên',
  'Export': 'Xuất',
  'Markdown': 'Markdown',
  'Plain text': 'Văn bản thuần',
  'Web page': 'Trang web',
  'Print or save as PDF': 'In hoặc lưu PDF',
  'Focus mode': 'Chế độ tập trung',
  'Focus mode (full screen writing)': 'Chế độ tập trung (viết toàn màn hình)',
  'Exit focus mode': 'Thoát chế độ tập trung',
  'Exit focus mode (Esc)': 'Thoát chế độ tập trung (Esc)',
  'Exit Focus': 'Thoát tập trung',
  'Document title': 'Tiêu đề tài liệu',
  'Document content': 'Nội dung tài liệu',
  'Untitled document': 'Tài liệu chưa đặt tên',
  "Start writing, or type '/' for blocks": 'Bắt đầu viết, hoặc gõ “/” để chèn khối',
  "Type '/' for blocks": 'Gõ “/” để chèn khối',
  'Heading {n}': 'Tiêu đề {n}',
  'Heading 1': 'Tiêu đề 1',
  'Heading 2': 'Tiêu đề 2',
  'Heading 3': 'Tiêu đề 3',
  'Bold': 'In đậm',
  'Italic': 'In nghiêng',
  'Underline': 'Gạch chân',
  'Strikethrough': 'Gạch ngang',
  'Inline code': 'Mã nội dòng',
  'Link': 'Liên kết',
  'Add row below': 'Thêm hàng bên dưới',
  'Add column right': 'Thêm cột bên phải',
  'Delete row': 'Xoá hàng',
  'Delete column': 'Xoá cột',
  'Delete table': 'Xoá bảng',
  '{n} words': '{n} từ',
  '{n} characters': '{n} ký tự',
  '~{n} min read': '~{n} phút đọc',
  'No documents found': 'Không có tài liệu nào',
  'Create a document': 'Tạo tài liệu',
  'Edit link': 'Sửa liên kết',
  'Insert link': 'Chèn liên kết',
  'Link address': 'Địa chỉ liên kết',
  'Remove': 'Gỡ',
  'Save link': 'Lưu liên kết',
  'Are you sure you want to delete **“{title}”**? This action cannot be undone.':
    'Bạn chắc chắn muốn xoá **“{title}”**? Không thể hoàn tác.',
  'Export backup now': 'Sao lưu ngay',
  'Browser storage is full. Export a backup now; your open work remains available.':
    'Bộ nhớ trình duyệt đã đầy. Hãy sao lưu ngay; nội dung đang mở vẫn còn.',
  'Save failed. Export your work before closing this tab.': 'Lưu thất bại. Hãy xuất bản sao trước khi đóng tab.',
  'IndexedDB is unavailable. Work cannot be saved in this browser.': 'Không dùng được IndexedDB. Trình duyệt này không lưu được dữ liệu.',
  'Local storage could not be opened. Your current work will remain on screen.':
    'Không mở được bộ nhớ cục bộ. Nội dung hiện tại vẫn ở trên màn hình.',
  'That image could not be added.': 'Không thêm được ảnh này.',
  'This image is larger than 15 MB. Try a smaller one.': 'Ảnh lớn hơn 15 MB. Hãy thử ảnh nhỏ hơn.',
  'Duplicated "{title}"': 'Đã nhân bản “{title}”',
  'Deleted "{title}"': 'Đã xoá “{title}”',
  '{title} (Copy)': '{title} (Bản sao)',
  'Restored {n} item.': 'Đã khôi phục {n} mục.',
  'Restored {n} items.': 'Đã khôi phục {n} mục.',
  '{n} item had newer edits here, so the backup version was added as a “(from backup)” copy.':
    '{n} mục ở đây mới hơn, nên bản trong file sao lưu được thêm thành bản “(từ sao lưu)”.',
  '{n} items had newer edits here, so the backup version was added as a “(from backup)” copy.':
    '{n} mục ở đây mới hơn, nên bản trong file sao lưu được thêm thành bản “(từ sao lưu)”.',
  'The backup was empty.': 'File sao lưu trống.',
  'Document imported.': 'Đã nhập tài liệu.',
  'This file could not be read. Choose a My Space backup (.json) or a .md, .txt or .html file.':
    'Không đọc được file này. Hãy chọn file sao lưu My Space (.json) hoặc file .md, .txt, .html.',
  'This file is not a My Space backup.': 'File này không phải bản sao lưu My Space.',
  'Unsupported or damaged backup file.': 'File sao lưu không hỗ trợ hoặc bị hỏng.',
  'This backup is damaged. Nothing was imported.': 'File sao lưu bị hỏng. Chưa nhập gì cả.',
  'Welcome to My Space': 'Chào mừng đến My Space',
  'A quiet place for clear thinking.': 'Một góc yên tĩnh để nghĩ cho rõ.',
  'Everything you write stays in this browser. Type “/” for blocks, or select text to format it.':
    'Mọi thứ bạn viết đều nằm trong trình duyệt này. Gõ “/” để chèn khối, hoặc bôi đen chữ để định dạng.',
  'Blocks': 'Khối',
  'Insert block': 'Chèn khối',
  'Text': 'Văn bản',
  'Plain paragraph': 'Đoạn văn thường',
  'Big section title': 'Tiêu đề lớn',
  'Medium heading': 'Tiêu đề vừa',
  'Small heading': 'Tiêu đề nhỏ',
  'Bulleted list': 'Danh sách chấm',
  'Simple list': 'Danh sách đơn giản',
  'Numbered list': 'Danh sách số',
  'To-do list': 'Danh sách việc',
  'Checkboxes': 'Ô đánh dấu',
  'Quote': 'Trích dẫn',
  'Call out a passage': 'Làm nổi một đoạn',
  'Code': 'Mã',
  'Code block': 'Khối mã',
  'Divider': 'Đường kẻ',
  'Horizontal line': 'Đường kẻ ngang',
  'Table': 'Bảng',
  'Image': 'Ảnh',
  'Upload or paste': 'Tải lên hoặc dán',
  'Formatting': 'Định dạng',
  'Undo': 'Hoàn tác',
  'Redo': 'Làm lại',
  'Done': 'Xong',
  'Voice typing': 'Nhập bằng giọng nói',
  'Stop voice typing': 'Dừng nhập bằng giọng nói',
  "Voice typing — your browser's speech service turns speech into text (online)":
    'Nhập bằng giọng nói — dịch vụ giọng nói của trình duyệt chuyển lời nói thành chữ (cần mạng)',
  'Listening…': 'Đang nghe…',
  'Stop': 'Dừng',
  'Switch language': 'Đổi ngôn ngữ',
  'Microphone access is blocked. Allow it in the browser’s site settings to dictate.':
    'Micro đang bị chặn. Hãy cho phép trong cài đặt trang của trình duyệt.',
  'Voice typing stopped: the speech service is unavailable right now.': 'Đã dừng: dịch vụ giọng nói đang không dùng được.',
  'Voice typing could not start.': 'Không bắt đầu được nhập bằng giọng nói.',

  // Rich formatting
  'Turn into': 'Chuyển thành',
  'Colour': 'Màu',
  'Text colour': 'Màu chữ',
  'Highlight': 'Tô nền',
  'Default': 'Mặc định',
  'None': 'Không',
  'Gray': 'Xám',
  'Brown': 'Nâu',
  'Orange': 'Cam',
  'Yellow': 'Vàng',
  'Green': 'Xanh lá',
  'Blue': 'Xanh dương',
  'Purple': 'Tím',
  'Pink': 'Hồng',
  'Red': 'Đỏ',
  'Text size and alignment': 'Cỡ chữ và căn lề',
  'Font, size and alignment': 'Font, cỡ chữ và căn lề',
  'Font': 'Font chữ',
  'Page font': 'Font của trang',
  'Clean': 'Gọn gàng',
  'Modern': 'Hiện đại',
  'Rounded': 'Tròn trịa',
  'Serif': 'Có chân',
  'Elegant': 'Sang trọng',
  'Mono': 'Đơn cách',
  'Handwriting': 'Viết tay',
  'Colour, size and alignment': 'Màu, cỡ chữ và căn lề',
  'Small': 'Nhỏ',
  'Normal': 'Thường',
  'Large': 'Lớn',
  'Huge': 'Rất lớn',
  'Alignment': 'Căn lề',
  'Align left': 'Căn trái',
  'Align center': 'Căn giữa',
  'Align right': 'Căn phải',
  'Justify': 'Căn đều',
  'More': 'Thêm',
  'Superscript': 'Chỉ số trên',
  'Subscript': 'Chỉ số dưới',
  'Clear formatting': 'Xoá định dạng',

  // Create
  'Boards': 'Bảng vẽ',
  'New board': 'Bảng vẽ mới',
  'Untitled board': 'Bảng vẽ chưa đặt tên',
  'Ideas board': 'Bảng ý tưởng',
  'Imported board': 'Bảng vẽ đã nhập',
  'Boards navigation': 'Danh sách bảng vẽ',
  'Rename board': 'Đổi tên bảng vẽ',
  'Rename {title}': 'Đổi tên {title}',
  'Duplicate board': 'Nhân bản bảng vẽ',
  'Delete board': 'Xoá bảng vẽ',
  'Import board': 'Nhập bảng vẽ',
  'Stored only in this browser. PNG and SVG export are in the canvas menu.':
    'Chỉ lưu trong trình duyệt này. Xuất PNG, SVG có trong menu của bảng vẽ.',
  'Close boards': 'Đóng danh sách bảng vẽ',
  'Hide boards sidebar': 'Ẩn danh sách bảng vẽ',
  'Show boards sidebar': 'Hiện danh sách bảng vẽ',
  'Board title': 'Tên bảng vẽ',
  'Click to rename board': 'Bấm để đổi tên bảng vẽ',
  'Board name': 'Tên bảng vẽ',
  'Save name': 'Lưu tên',
  'Capture': 'Chụp',
  'Copy image': 'Sao chép ảnh',
  'paste anywhere': 'dán ở đâu cũng được',
  'Save PNG': 'Lưu PNG',
  'Frame it': 'Đóng khung',
  'Export board (.json)': 'Xuất bảng vẽ (.json)',
  'Export board': 'Xuất bảng vẽ',
  'Export now': 'Xuất ngay',
  'Loading the infinite canvas…': 'Đang mở bảng vẽ vô hạn…',
  'Draw something first, then capture it.': 'Hãy vẽ gì đó trước rồi chụp nhé.',
  'Selection copied as an image — paste it anywhere.': 'Đã sao chép phần chọn thành ảnh — dán ở đâu cũng được.',
  'Board copied as an image — paste it anywhere.': 'Đã sao chép bảng vẽ thành ảnh — dán ở đâu cũng được.',
  'Selection saved as PNG.': 'Đã lưu phần chọn thành PNG.',
  'Board saved as PNG.': 'Đã lưu bảng vẽ thành PNG.',
  "Copying isn't allowed here, so the image was saved instead.": 'Trình duyệt không cho sao chép nên ảnh đã được lưu thành file.',
  'The image could not be created.': 'Không tạo được ảnh.',
  'Browser storage is full. Export this board now; the canvas remains open.':
    'Bộ nhớ trình duyệt đã đầy. Hãy xuất bảng vẽ ngay; bảng vẫn đang mở.',
  'The board could not be saved. Export it before leaving.': 'Không lưu được bảng vẽ. Hãy xuất trước khi rời đi.',
  'Canvas storage is unavailable. You can draw, but export before leaving.':
    'Không dùng được bộ nhớ bảng vẽ. Bạn vẫn vẽ được, nhưng hãy xuất trước khi rời đi.',
  'This board could not be opened, so changes to it are not saved. Export it to keep the original.':
    'Không mở được bảng vẽ này nên thay đổi sẽ không được lưu. Hãy xuất để giữ bản gốc.',
  'This file is not a board that My Space or tldraw can open. Nothing was imported.':
    'File này không phải bảng vẽ mà My Space hay tldraw mở được. Chưa nhập gì cả.',
  'Board "{title}" imported.': 'Đã nhập bảng vẽ “{title}”.',

  // Frame & screen capture
  'Capture screen': 'Chụp màn hình',
  'Crop screenshot': 'Cắt ảnh chụp màn hình',
  'Drag to select the part you want · Enter to confirm · Esc to cancel': 'Kéo để chọn vùng muốn lấy · Enter để xác nhận · Esc để huỷ',
  'Whole screen': 'Cả màn hình',
  'Use selection': 'Dùng vùng đã chọn',
  'The screen could not be captured.': 'Không chụp được màn hình.',
  'Choose image': 'Chọn ảnh',
  'Annotate in Create': 'Vẽ chú thích trong Vẽ',
  'Remove image': 'Bỏ ảnh',
  'Preview': 'Xem trước',
  'Make a screenshot look good': 'Làm ảnh chụp màn hình đẹp hơn',
  'Paste (Ctrl+V), drop an image here, or choose one.': 'Dán (Ctrl+V), kéo thả ảnh vào đây, hoặc chọn ảnh.',
  'Frame settings': 'Tuỳ chỉnh khung',
  'Size': 'Kích thước',
  'Auto': 'Tự động',
  'Background': 'Nền',
  'Blurred image': 'Ảnh làm mờ',
  'Transparent': 'Trong suốt',
  'Frame style': 'Kiểu khung',
  'none': 'Không khung',
  'window-light': 'Cửa sổ sáng',
  'window-dark': 'Cửa sổ tối',
  'browser-light': 'Trình duyệt sáng',
  'browser-dark': 'Trình duyệt tối',
  'Padding': 'Lề',
  'Roundness': 'Bo góc',
  'Shadow': 'Đổ bóng',
  'Image size': 'Cỡ ảnh',
  'Watermark': 'Chữ ký',
  'Optional text, e.g. your name': 'Không bắt buộc, ví dụ tên bạn',
  'Download': 'Tải xuống',
  'original size': 'kích thước gốc',
  'extra sharp': 'nét gấp đôi',
  'smaller file': 'file nhẹ hơn',
  'Copied — paste it anywhere.': 'Đã sao chép — dán ở đâu cũng được.',
  'That image could not be opened.': 'Không mở được ảnh này.',
  'Screenshot': 'Ảnh chụp màn hình',
  'Screenshot added to the board.': 'Đã thêm ảnh chụp vào bảng vẽ.',

  // Work
  'Reload workspace': 'Tải lại',
  'Reload TanFlow': 'Tải lại TanFlow',
  'Open TanFlow in external tab': 'Mở TanFlow ở tab mới',
  'Open in new tab': 'Mở ở tab mới',
  'Opening TanFlow': 'Đang mở TanFlow',
  'TanFlow could not be embedded': 'Không nhúng được TanFlow',
  'The host may block iframes, be offline, or be taking too long. Your safest option is to open the original workspace directly.':
    'Trang có thể chặn nhúng, đang offline hoặc tải quá lâu. Cách chắc nhất là mở TanFlow trực tiếp.',
  'Open TanFlow': 'Mở TanFlow',
  'Try again': 'Thử lại',
}

let current: Lang = 'en'

/** Current language outside React (e.g. editor placeholders). */
export const getLang = () => current

export function translate(key: string, vars?: Record<string, string | number>, lang: Lang = current): string {
  const text = (lang === 'vi' && VI[key]) || key
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text
}

/** Renders `**bold**` segments of a translated string. */
export function rich(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))
}

export const detectLang = (): Lang => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'vi' || saved === 'en') return saved
  } catch {}
  return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string }

const I18nContext = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, v) => translate(k, v, 'en') })

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const detected = detectLang()
    current = detected
    setLangState(detected)
    document.documentElement.lang = detected
    // Server HTML is English; labels stay hidden until the real language is in.
    document.documentElement.dataset.i18n = 'ready'
  }, [])

  const setLang = useCallback((next: Lang) => {
    current = next
    setLangState(next)
    document.documentElement.lang = next
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {}
  }, [])

  const value = useMemo<I18n>(() => ({ lang, setLang, t: (k, v) => translate(k, v, lang) }), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
