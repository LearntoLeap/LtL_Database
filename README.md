# 📚 LtL Database

Thư viện liên kết tài liệu của **Learn to Leap**: Google Drive, YouTube, báo chí/PR, website.

Kiến trúc static-CRUD: web tĩnh public + admin CRUD qua GitHub API, deploy bằng GitHub Pages. **Không server, không database, không phí.**

## 🎯 Tính năng

- **2 view**:
  - `index.html` — Public, ai cũng xem được, có search/filter/sort.
  - `admin.html` — Admin, đăng nhập bằng GitHub Personal Access Token (PAT).
- **Preview tài liệu inline**: Google Drive (file/docs/sheets/slides), YouTube embed; báo chí/web mở tab mới.
- **Toggle hiện/ẩn thumbnail** trên từng mục (auto lấy thumbnail từ YouTube/Drive nếu không nhập tay).
- **Toggle previewable** trên từng mục.
- **Đánh dấu nổi bật** (featured).
- **Categories**: Google Drive, YouTube, Báo chí/PR, Website/Khác (có thể chỉnh trong `data/items.json`).

## 🏗 Kiến trúc

```
LtL_Database/
├── index.html              # Public view
├── admin.html              # Admin CRUD
├── assets/
│   ├── css/app.css
│   └── js/
│       ├── app.js          # Render public + preview logic
│       └── admin.js        # GitHub Contents API CRUD
├── data/items.json         # "Database" (JSON tĩnh trong repo)
├── images/                 # Upload ảnh (nếu cần thumbnail tự upload)
└── .github/workflows/pages.yml  # Auto-deploy
```

## 🚀 Deploy lần đầu

1. **Tạo repo** trên GitHub: `LearntoLeap/LtL_Database` (Public).
2. **Push code**:
   ```bash
   cd LtL_Database_v2
   git init
   git add .
   git commit -m "Initial: LtL Database static-CRUD"
   git branch -M main
   git remote add origin https://github.com/LearntoLeap/LtL_Database.git
   git push -u origin main
   ```
3. **Bật GitHub Pages**: vào repo Settings → Pages → Source: **GitHub Actions** (không phải "Deploy from a branch").
4. Đợi workflow chạy xong (~1 phút), truy cập: `https://learntoleap.github.io/LtL_Database/`.

## 🔐 Tạo Personal Access Token (PAT) cho admin

1. Vào https://github.com/settings/personal-access-tokens/new
2. Cấu hình:
   - **Resource owner**: `LearntoLeap`
   - **Repository access**: chỉ `LtL_Database`
   - **Permissions** → Repository:
     - `Contents`: **Read and write**
     - `Metadata`: Read (tự bật)
3. Generate → copy token (chỉ hiện 1 lần).
4. Vào `https://learntoleap.github.io/LtL_Database/admin.html` → đăng nhập:
   - Owner: `LearntoLeap`
   - Repo: `LtL_Database`
   - Branch: `main`
   - Token: dán PAT vừa tạo
   - Tick "Nhớ token" nếu muốn lưu trong localStorage.

## ✍️ Thêm/sửa/xoá tài liệu

- Vào `admin.html` → đăng nhập → **➕ Thêm mục**.
- Dán URL (Drive, YouTube, link báo…). Hệ thống tự nhận diện loại + sinh preview embed.
- Toggle nút **🖼** trên từng dòng để bật/tắt nhanh thumbnail.

## 📝 Schema `data/items.json`

```json
{
  "categories": [
    { "id": "drive", "name": "Google Drive", "icon": "📁", "description": "…" }
  ],
  "items": [
    {
      "id": "i1zabc",
      "title": "Tên tài liệu",
      "slug": "ten-tai-lieu",
      "category": "drive",
      "url": "https://drive.google.com/…",
      "description": "Mô tả ngắn",
      "thumbnail": "",
      "showThumbnail": true,
      "previewable": true,
      "tags": ["stem","b2b"],
      "source": "Tuổi Trẻ",
      "publishedAt": "2026-05-19",
      "createdAt": "2026-05-19",
      "featured": false
    }
  ]
}
```

## 🐞 Lỗi thường gặp

| Lỗi | Fix |
|-----|-----|
| Workflow fail `Setup Pages` | Settings → Pages → Source: **GitHub Actions** |
| `PUT 409` khi lưu admin | Đã có handler hỏi ghi đè, hoặc Reload rồi sửa lại |
| Site không update sau khi sửa | F5 cứng (Ctrl+Shift+R); workflow mất ~1 phút |
| Preview Drive bị "Truy cập bị từ chối" | Chia sẻ file ở chế độ "Anyone with the link — Viewer" |

## 📌 Lưu ý

- File Drive muốn preview/thumbnail công khai → phải share "Anyone with the link".
- Báo chí/web: hệ thống chỉ mở tab mới, không nhúng inline (do X-Frame-Options của các trang báo).
- Mọi thay đổi qua admin = 1 commit thật vào repo → có git history, có thể `git revert`.

---

© Learn to Leap — Built on the [static-CRUD playbook](https://github.com/LearntoLeap/Shop).
