# Quản lý giảng viên

Ứng dụng quản trị **QLHocPhan** dùng React Native (Expo SDK 58), Node.js/Express và MongoDB. Web và Android dùng chung giao diện và API.

## Yêu cầu và chức năng

- Thêm giảng viên kèm ảnh và hiển thị danh sách trên web.
- Đăng nhập quản trị, xem chi tiết, sửa và xóa có xác nhận.
- Tìm theo mã hoặc họ tên, lọc theo nhóm số lớp, sắp xếp theo họ tên hoặc tổng số lớp, xem biểu đồ và sao lưu/nhập JSON.
- Trên Android, dùng Expo Go để nhập ảnh từ thư viện và hiển thị thông tin giảng viên.

## So sánh và xuất bảng tổng hợp

- Chọn **Chọn để so sánh** trên danh sách hoặc **Thêm vào so sánh** trong chi tiết. Mở bảng so sánh khi đã chọn từ hai đến bốn người.
- Mở **Lọc nâng cao** để nhập khoảng số lớp. Có thể kết hợp với nhóm và từ khóa mã, họ tên. **Xóa bộ lọc** đặt lại nhóm, từ khóa và khoảng số lớp.
- Bấm **Xuất CSV** để tải mã, họ tên và tổng số lớp theo đúng danh sách và thứ tự đang hiển thị. Tệp CSV dùng UTF-8 có BOM. Tệp `GiangVien.json` dùng để sao lưu đầy đủ hồ sơ và ảnh.

## Cơ sở dữ liệu

MongoDB dùng cơ sở dữ liệu `QLHocPhan` và collection `GiangVien`.

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `IDGV` | Chuỗi | Mã giảng viên duy nhất. Ứng dụng chuẩn hóa thành chữ hoa. Cho phép 1–32 chữ cái A–Z, chữ số, dấu gạch dưới hoặc gạch ngang. |
| `Fullname` | Chuỗi | Họ và tên, tối đa 120 ký tự. |
| `Image` | Chuỗi | Data URI JPEG, PNG hoặc WebP có nội dung Base64. |
| `SumClass` | Số nguyên | Tổng số lớp, từ 0 trở lên. |

MongoDB quản lý `_id` tự sinh để xác định bản ghi. Tệp `GiangVien.json` xuất ra gồm đúng bốn trường nghiệp vụ và giữ cả ảnh. Repo đi kèm `GiangVien.json` chứa hồ sơ giảng viên giả lập và ảnh minh họa. Sao lưu JSON cho phép xem trước bản ghi hợp lệ, lỗi và trùng mã. Khi mã đã tồn tại và dữ liệu khác, ứng dụng đối chiếu họ tên, số lớp và trạng thái thay đổi ảnh. Mặc định bỏ qua. Chọn Cập nhật cho từng mã cần sửa rồi xác nhận.

## Cài đặt và chạy trên web

Cần Node.js 24, npm và MongoDB đang chạy. Mở thư mục gốc trong VS Code. Nếu dùng Docker để chạy MongoDB cục bộ lần đầu:

```powershell
docker run --name midterm-mongo -d -p 127.0.0.1:27017:27017 -v midterm-mongo-data:/data/db mongo:8.0
```

Nếu máy đã có MongoDB chạy ở cổng 27017 thì dùng phiên đó. Ở terminal thứ nhất, từ thư mục gốc:

```powershell
cd server
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Trong `server/.env`, đặt `ADMIN_USERNAME` và `ADMIN_PASSWORD` để khởi tạo tài khoản đầu tiên. Kiểm tra `MONGODB_URI` và để `MONGODB_DATABASE=QLHocPhan`. Khởi động API:

```powershell
npm.cmd start
```

API khởi tạo tài khoản đầu tiên trong `QLHocPhan.TaiKhoan` khi collection trống. Các trường nghiệp vụ gồm `Username` (duy nhất), `PasswordHash` (scrypt kèm salt) và `IsActive` (trạng thái hoạt động). API đọc collection này khi đăng nhập. Mật khẩu dạng văn bản chỉ dùng làm đầu vào khi khởi tạo hoặc cập nhật.

Để tạo thêm tài khoản hoặc đổi mật khẩu của tài khoản hiện có, đặt `ADMIN_USERNAME` và `ADMIN_PASSWORD` tương ứng trong `server/.env`, rồi chạy từ thư mục gốc:

```powershell
npm.cmd --prefix server run admin:save
```

Tài khoản mới được bật mặc định. Có thể đặt `IsActive=false` trong MongoDB Compass để vô hiệu hóa tài khoản. Đổi mật khẩu hoặc vô hiệu hóa sẽ chặn phiên cũ từ yêu cầu tiếp theo. Dữ liệu tài khoản nằm riêng trong `TaiKhoan`. Lệnh xuất `GiangVien.json` chỉ xuất hồ sơ giảng viên.

Ở terminal thứ hai, từ thư mục gốc:

```powershell
cd app
npm.cmd ci
npm.cmd run web -- --port 8081
```

Mở [giao diện web](http://localhost:8081) và đăng nhập. Kiểm tra API tại [trang trạng thái](http://localhost:4000/api/health). Nếu cơ sở dữ liệu trống, mở **Sao lưu JSON → Chọn tệp JSON**, chọn `GiangVien.json`, xem trước và bấm **Xác nhận nhập**.

Các lệnh cài thư viện được dùng trong quá trình phát triển:

```powershell
npm.cmd install express cors mongodb
npx.cmd expo install react-dom react-native-web @expo/metro-runtime expo-image-picker
npx.cmd expo install expo-document-picker expo-file-system expo-sharing
```

Lệnh đầu chạy trong `server/`, hai lệnh Expo chạy trong `app/`. Sau khi tải mã nguồn, dùng `npm ci` ở từng thư mục để cài theo tệp khóa.

## Chạy Android bằng USB và Expo Go

Cài Expo Go tương thích với SDK 58 và Android SDK Platform-Tools. Bật Gỡ lỗi USB, cắm cáp truyền dữ liệu và cho phép máy tính kết nối. Giữ API ở cổng 4000. Từ thư mục gốc:

```powershell
adb devices
adb reverse tcp:8082 tcp:8082
adb reverse tcp:4000 tcp:4000
cd app
$env:EXPO_PUBLIC_API_URL = 'http://127.0.0.1:4000'
npx.cmd expo start --localhost --port 8082 --go
```

Mở dự án trong Expo Go bằng mã QR hoặc địa chỉ `exp://127.0.0.1:8082`. Nếu dùng ADB đã tải trong thư mục dự án, thay `adb` bằng `.\.runtime\platform-tools\adb.exe` khi chạy ở thư mục gốc. Đăng nhập, thêm giảng viên bằng ảnh từ thư viện và kiểm tra bản ghi trên cả Android và web.

## Xuất dữ liệu để nộp bài

Bấm **Tải GiangVien.json** trong mục **Sao lưu JSON**, hoặc từ thư mục gốc chạy:

```powershell
npm.cmd --prefix server run export
```

Nộp tệp JSON theo kênh của môn học. Có thể dùng `GiangVien.json` trong repo để chạy thử. Báo cáo nộp bài cần có ảnh thao tác trên web, ảnh collection `QLHocPhan.GiangVien` trong MongoDB Compass, ảnh chạy trên Android và liên kết video demo.
