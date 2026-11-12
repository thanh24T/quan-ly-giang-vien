import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Svg, { Circle, G } from 'react-native-svg';

const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const API = process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
const emptyForm = { IDGV: '', Fullname: '', Image: '', SumClass: '' };
const CARD_GAP = 14;
const categories = [
  { id: 'all', label: 'Tất cả', icon: '▦' },
  { id: 'none', label: 'Chưa có lớp', icon: '0' },
  { id: 'few', label: '1 đến 4 lớp', icon: '1 - 4' },
  { id: 'many', label: 'Từ 5 lớp', icon: '5+' },
];
const operations = [
  { id: 'add', label: 'Thêm giảng viên', compact: 'Thêm', icon: '＋' },
  { id: 'edit', label: 'Sửa giảng viên', compact: 'Sửa', icon: '✎' },
  { id: 'delete', label: 'Xóa giảng viên', compact: 'Xóa', icon: '🗑' },
  { id: 'charts', label: 'Biểu đồ giảng viên', compact: 'Biểu đồ', icon: '▥' },
  { id: 'backup', label: 'Sao lưu JSON', compact: 'Sao lưu', icon: '⇅' },
];
const sortOptions = [
  { id: 'default', label: 'Mặc định' },
  { id: 'name-asc', label: 'Họ và tên A–Z', compare: (a, b) => a.Fullname.localeCompare(b.Fullname, 'vi') },
  { id: 'classes-asc', label: 'Tổng số lớp tăng dần', compare: (a, b) => a.SumClass - b.SumClass },
  { id: 'classes-desc', label: 'Tổng số lớp giảm dần', compare: (a, b) => b.SumClass - a.SumClass },
];
const integer = new Intl.NumberFormat('vi-VN');

function normalizeName(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function classGroup(count) {
  return count === 0 ? 'none' : count < 5 ? 'few' : 'many';
}

async function request(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(API + '/api' + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Không kết nối được API. Kiểm tra máy chủ và địa chỉ kết nối.');
  }
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function saveFile(filename, content, mimeType) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType });
}

function csvCell(value) {
  const text = String(value);
  const safe = typeof value === 'string' && /^[\s]*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function AppBackground({ children, login = false, compact = false }) {
  return (
    <View style={[styles.screen, compact && styles.mobileScreen]}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <Image source={require('./assets/teachers-day-background.png')} resizeMode="cover"
          style={[styles.backgroundImage, compact && styles.mobileBackgroundImage]} />
        {!compact && <View style={[styles.backgroundShade, login && styles.loginShade]} />}
      </View>
      <View collapsable={false} style={styles.foreground}>
        {children}
      </View>
    </View>
  );
}

function Button({ children, onPress, disabled, variant = 'primary' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.button, styles[variant], (pressed || disabled) && styles.dim]}>
      <Text style={[styles.buttonText, variant === 'primary' && styles.primaryText]}>{children}</Text>
    </Pressable>
  );
}

function Field({ label, inputStyle, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={[styles.input, inputStyle]} placeholderTextColor="#64748b" {...props} />
    </View>
  );
}

function BarChart({ title, rows, format, color }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <View style={styles.chartCard}>
      <Text accessibilityRole="header" style={styles.chartTitle}>{title}</Text>
      {rows.length === 0 && <Text style={styles.muted}>Chưa có dữ liệu.</Text>}
      {rows.map(row => (
        <View key={row.id} style={styles.chartRow}>
          <View style={styles.chartRowHeader}>
            <Text style={styles.chartLabel}>{row.label}</Text>
            <Text style={styles.chartValue}>{format.format(row.value)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: (row.value / max) * 100 + '%', backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const classGroupColors = { none: '#65748c', few: '#238675', many: '#cb783c' };
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function LecturerDonut({ rows, total }) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={styles.chartCard}>
      <Text accessibilityRole="header" style={styles.chartTitle}>Tỷ lệ giảng viên theo nhóm số lớp</Text>
      <View style={styles.donutGraphic}>
        <Svg width={128} height={128} viewBox="0 0 128 128">
          <Circle cx={64} cy={64} r={radius} fill="none" stroke="#edf1f4" strokeWidth={18} />
          <G transform="rotate(-90 64 64)">
            {rows.filter(row => row.value > 0).map(row => {
              const length = circumference * row.value / total;
              const start = offset;
              offset += length;
              return (
                <Circle key={row.id} cx={64} cy={64} r={radius} fill="none"
                  stroke={classGroupColors[row.id]} strokeWidth={18}
                  strokeDasharray={length === circumference ? undefined : [length, circumference - length]}
                  strokeDashoffset={-start} />
              );
            })}
          </G>
        </Svg>
        <View pointerEvents="none" style={styles.donutCenter}>
          <Text style={styles.metricValue}>{integer.format(total)}</Text>
          <Text style={styles.donutCaption}>giảng viên</Text>
        </View>
      </View>
      {rows.map(row => (
        <View key={row.id} style={styles.chartRowHeader}>
          <View style={styles.legendLabel}>
            <View style={[styles.legendDot, { backgroundColor: classGroupColors[row.id] }]} />
            <Text style={styles.chartLabel}>{row.label}</Text>
          </View>
          <Text style={styles.chartValue}>{integer.format(row.value)} · {percent.format(row.value / total)}</Text>
        </View>
      ))}
    </View>
  );
}

function ClassDistribution({ rows }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <View style={styles.chartCard}>
      <Text accessibilityRole="header" style={styles.chartTitle}>Phân bố theo từng mức số lớp</Text>
      <Text style={styles.muted}>Chiều cao cột biểu thị số giảng viên.</Text>
      <ScrollView horizontal accessibilityLabel="Phân bố số giảng viên"
        contentContainerStyle={styles.columnPlot}>
        {rows.map(({ count, value }) => (
          <View key={count} style={styles.chartColumn}
            accessible accessibilityLabel={integer.format(count) + ' lớp, ' + integer.format(value) + ' giảng viên'}>
            <View style={styles.columnTrack}>
              <Text style={styles.chartValue}>{integer.format(value)}</Text>
              <View style={[styles.columnBar, {
                height: Math.max(3, Math.round(value / max * 92)),
                backgroundColor: classGroupColors[classGroup(count)],
              }]} />
            </View>
            <Text style={styles.columnLabel}>{integer.format(count)} lớp</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function LecturerCharts({ lecturers, wide }) {
  if (!lecturers.length) return <Text style={styles.muted}>Thêm giảng viên để xem biểu đồ.</Text>;

  const groups = new Map();
  const distribution = new Map();
  let sumClasses = 0;
  const ranking = lecturers.map(lecturer => {
    const count = lecturer.SumClass;
    const group = classGroup(count);
    groups.set(group, (groups.get(group) ?? 0) + 1);
    distribution.set(count, (distribution.get(count) ?? 0) + 1);
    sumClasses += count;
    return { id: lecturer._id, label: lecturer.Fullname + ' · ' + lecturer.IDGV, value: count };
  });
  const classGroups = categories.filter(item => item.id !== 'all').map(item => ({
    ...item, value: groups.get(item.id) ?? 0,
  }));
  const columns = Array.from(distribution, ([count, value]) => ({ count, value })).sort((a, b) => a.count - b.count);
  const top = ranking.filter(row => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);

  return (
    <>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.muted}>Giảng viên</Text>
          <Text style={styles.metricValue}>{integer.format(lecturers.length)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.muted}>Tổng số lớp</Text>
          <Text style={styles.metricValue}>{integer.format(sumClasses)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.muted}>Số lớp trung bình mỗi giảng viên</Text>
          <Text style={styles.metricValue}>{decimal.format(sumClasses / lecturers.length)}</Text>
        </View>
      </View>
      <View style={[styles.chartGrid, wide && styles.chartGridWide]}>
        <LecturerDonut rows={classGroups} total={lecturers.length} />
        <ClassDistribution rows={columns} />
      </View>
      <BarChart title="Top 5 giảng viên theo số lớp" rows={top} format={integer} color="#136d5d" />
    </>
  );
}

function CompareLecturers({ selected }) {
  return (
    <>
      <ScrollView horizontal contentContainerStyle={styles.compareRow}>
        {selected.map(lecturer => (
          <View key={lecturer._id} style={styles.compareCard}>
            <Image source={{ uri: lecturer.Image }} style={styles.compareImage} />
            <Text style={styles.label}>{lecturer.Fullname}</Text>
            <Text style={styles.lecturerCode}>{lecturer.IDGV}</Text>
            <Text style={styles.label}>Tổng số lớp {integer.format(lecturer.SumClass)}</Text>
          </View>
        ))}
      </ScrollView>
      <BarChart title="So sánh tổng số lớp" rows={selected.map(lecturer => ({
        id: lecturer._id, label: lecturer.Fullname, value: lecturer.SumClass,
      }))} format={integer} color="#136d5d" />
    </>
  );
}

function ImportConflict({ conflict, update, onSelect }) {
  return (
    <View style={styles.chartCard}>
      <Text style={styles.label}>{conflict.id}</Text>
      <View style={styles.compareRow}>
        {[[conflict.before, 'Hiện tại'], [conflict.after, 'Trong tệp']].map(([item, title]) => (
          <View key={title} style={styles.diffColumn}>
            <Text style={styles.label}>{title}</Text>
            <Text style={styles.muted}>{item.Fullname}</Text>
            <Text style={styles.muted}>Tổng số lớp {integer.format(item.SumClass)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>{conflict.imageChanged ? 'Ảnh trong tệp khác ảnh hiện tại.' : 'Ảnh giống nhau.'}</Text>
      <View style={styles.actions}>
        <Button variant={update ? 'secondary' : 'primary'} onPress={() => onSelect(false)}>Bỏ qua {conflict.id}</Button>
        <Button variant={update ? 'primary' : 'secondary'} onPress={() => onSelect(true)}>Cập nhật {conflict.id}</Button>
      </View>
    </View>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const cardWidth = 188;
  const lecturerScroll = useRef(null);
  const [stripWidth, setStripWidth] = useState(0);
  const [stripOffset, setStripOffset] = useState(0);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [lecturers, setLecturers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [category, setCategory] = useState('all');
  const [operation, setOperation] = useState(null);
  const [detail, setDetail] = useState(null);
  const [backup, setBackup] = useState(null);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [minClasses, setMinClasses] = useState('');
  const [maxClasses, setMaxClasses] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [sortId, setSortId] = useState('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  function closeOperation() {
    setOperation(null);
    setDetail(null);
    setBackup(null);
    setRemoving(null);
    setError('');
    resetForm();
  }

  function openOperation(value) {
    closeOperation();
    setMessage('');
    setOperation(value);
  }

  function clearSession() {
    setToken('');
    setLecturers([]);
    setSearch('');
    setFilterOpen(false);
    setToolsOpen(false);
    setMinClasses('');
    setMaxClasses('');
    setCompareMode(false);
    setCompareIds([]);
    setSortId('default');
    setSortOpen(false);
    setStripOffset(0);
    setCategory('all');
    closeOperation();
  }

  async function perform(action) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (failure) {
      if (failure.status === 401 && token) clearSession();
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    request('/lecturers', { token }).then(rows => {
      if (active) setLecturers(rows);
    }).catch(failure => {
      if (!active) return;
      if (failure.status === 401) setToken('');
      setError(failure.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  function login() {
    return perform(async () => {
      const result = await request('/login', { method: 'POST', body: { username: username.trim(), password } });
      setPassword('');
      setToken(result.token);
    });
  }

  function logout() {
    return perform(async () => {
      await request('/logout', { method: 'POST', token });
      clearSession();
    });
  }

  function showDetails(lecturer) {
    openOperation('detail');
    setDetail(lecturer);
  }

  async function openAndroidDownload(format, body) {
    const { path } = await request('/exports/' + format, { token, method: 'POST', body });
    await Linking.openURL(API + path);
  }

  function downloadBackup() {
    return perform(async () => {
      if (Platform.OS === 'android') {
        await openAndroidDownload('json');
        return;
      }
      const rows = await request('/lecturers', { token });
      const content = JSON.stringify(rows.map(({ IDGV, Fullname, Image, SumClass }) => ({
        IDGV, Fullname, Image, SumClass,
      })), null, 2);
      await saveFile('GiangVien.json', content, 'application/json');
    });
  }

  function chooseBackup() {
    return perform(async () => {
      const android = Platform.OS === 'android';
      const result = await DocumentPicker.getDocumentAsync({
        type: android
          ? ['application/json', 'text/plain', 'application/octet-stream']
          : ['application/json', 'text/plain', '.json'],
        // On Android, read the document URI granted by the system picker.
        copyToCacheDirectory: !android,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      setBackup(null);
      const web = Platform.OS === 'web';
      try {
        if (asset.size > MAX_BACKUP_BYTES) throw new Error('Tệp JSON phải nhỏ hơn hoặc bằng 32 MB.');
        let contents;
        try {
          contents = await (web ? asset.file : new File(asset.uri)).text();
        } catch {
          throw new Error('Không đọc được tệp đã chọn. Hãy mở Tải xuống hoặc Documents và chọn lại tệp JSON.');
        }
        let rows;
        try {
          rows = JSON.parse(contents.replace(/^\uFEFF/, ''));
        } catch {
          throw new Error('Không đọc được tệp. Hãy chọn một tệp JSON hợp lệ.');
        }
        if (!Array.isArray(rows)) throw new Error('Tệp JSON phải chứa một mảng giảng viên.');
        const preview = await request('/lecturers/import', {
          token, method: 'POST', body: { rows, commit: false },
        });
        setBackup({ name: asset.name, rows, ...preview, updateIds: [] });
      } finally {
        if (web) URL.revokeObjectURL(asset.uri);
      }
    });
  }

  function importBackup() {
    return perform(async () => {
      const result = await request('/lecturers/import', {
        token, method: 'POST', body: {
          rows: backup.rows, commit: true,
          updates: backup.conflicts.filter(item => backup.updateIds.includes(item.id))
            .map(({ id, version }) => ({ id, version })),
        },
      });
      setBackup(null);
      setMessage('Đã thêm ' + result.inserted + ' và cập nhật ' + result.updated + ' giảng viên. Bỏ qua ' +
        (result.duplicates - result.updated) + ' bản ghi trùng và ' + result.invalid + ' bản ghi lỗi.' +
        (result.stale ? ' Có hồ sơ vừa thay đổi. Hãy đối chiếu lại tệp.' : ''));
      setLecturers(await request('/lecturers', { token }));
      setCategory('all');
      clearFilters();
      closeOperation();
    });
  }

  function change(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function pickImage() {
    return perform(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], base64: true, quality: 0.55,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime = Platform.OS === 'web' ? asset.file?.type || asset.mimeType : 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !asset.base64) {
        throw new Error('Hãy chọn ảnh JPEG, PNG hoặc WebP.');
      }
      const image = 'data:' + mime + ';base64,' + asset.base64;
      if (image.length > 1500000) throw new Error('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.');
      change('Image', image);
    });
  }

  function save() {
    return perform(async () => {
      const { IDGV, Fullname, Image, SumClass } = form;
      const code = IDGV.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,32}$/.test(code) || !Fullname.trim() || !/^\d+$/.test(SumClass) ||
          !Number.isSafeInteger(Number(SumClass)) || !Image) {
        throw new Error('Nhập mã giảng viên hợp lệ, họ và tên, tổng số lớp nguyên không âm và ảnh.');
      }
      const saved = await request(editing ? '/lecturers/' + editing : '/lecturers', {
        token,
        method: editing ? 'PUT' : 'POST',
        body: { IDGV: code, Fullname: Fullname.trim(), Image, SumClass: Number(SumClass) },
      });
      setLecturers(current => editing
        ? current.map(lecturer => lecturer._id === editing ? saved : lecturer)
        : [saved, ...current]);
      setMessage(editing ? 'Đã cập nhật giảng viên.' : 'Đã thêm giảng viên.');
      closeOperation();
      setCategory(classGroup(saved.SumClass));
      searchLecturers('');
    });
  }

  function startEditing(lecturer) {
    setEditing(lecturer._id);
    setForm({ IDGV: lecturer.IDGV, Fullname: lecturer.Fullname, Image: lecturer.Image, SumClass: String(lecturer.SumClass) });
    setRemoving(null);
    setError('');
    setMessage('');
  }

  function removeLecturer() {
    return perform(async () => {
      await request('/lecturers/' + removing._id, { method: 'DELETE', token });
      setLecturers(current => current.filter(lecturer => lecturer._id !== removing._id));
      setCompareIds(current => current.filter(id => id !== removing._id));
      closeOperation();
      setMessage('Đã xóa giảng viên.');
    });
  }

  const lower = minClasses.trim() === '' ? 0 : Number(minClasses);
  const upper = maxClasses.trim() === '' ? Infinity : Number(maxClasses);
  const rangeInvalid = (minClasses.trim() !== '' && (!/^\d+$/.test(minClasses.trim()) || !Number.isSafeInteger(lower))) ||
    (maxClasses.trim() !== '' && (!/^\d+$/.test(maxClasses.trim()) || !Number.isSafeInteger(upper))) || lower > upper;
  const terms = normalizeName(search.trim()).split(/\s+/);
  const visibleLecturers = rangeInvalid ? [] : lecturers.filter(lecturer => {
    const searchable = normalizeName(lecturer.IDGV + ' ' + lecturer.Fullname);
    return (category === 'all' || classGroup(lecturer.SumClass) === category) &&
      lecturer.SumClass >= lower && lecturer.SumClass <= upper &&
      terms.every(term => searchable.includes(term));
  });
  const selectedLecturers = compareIds.map(id => lecturers.find(lecturer => lecturer._id === id)).filter(Boolean);
  const hasFilters = !!(search || minClasses || maxClasses || category !== 'all');

  function clearFilters() {
    setCategory('all');
    setMinClasses('');
    setMaxClasses('');
    searchLecturers('');
  }

  function toggleCompare(id) {
    setCompareIds(current => current.includes(id)
      ? current.filter(selected => selected !== id)
      : current.length < 4 ? [...current, id] : current);
  }

  function selectImportUpdate(id, update) {
    setBackup(current => ({
      ...current,
      updateIds: update ? [...new Set([...current.updateIds, id])] : current.updateIds.filter(item => item !== id),
    }));
  }

  function downloadCsv() {
    return perform(async () => {
      const rows = [
        ['Mã giảng viên', 'Họ và tên', 'Tổng số lớp'],
        ...visibleLecturers.map(({ IDGV, Fullname, SumClass }) => [IDGV, Fullname, SumClass]),
      ];
      const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
      const filename = 'TongHopGiangVien.csv';
      if (Platform.OS !== 'android') {
        await saveFile(filename, content, 'text/csv;charset=utf-8');
        return;
      }

      await openAndroidDownload('csv', { content });
    });
  }

  const sortOption = sortOptions.find(option => option.id === sortId);
  if (sortOption.compare) visibleLecturers.sort(sortOption.compare);
  const activeOperation = operations.find(item => item.id === operation);
  const showCharts = operation === 'charts';
  const showBackup = operation === 'backup';
  const showCompare = operation === 'compare';
  const showForm = operation === 'add' || (operation === 'edit' && editing);
  const chooseProduct = (operation === 'edit' && !editing) || (operation === 'delete' && !removing);

  const stripEnd = Math.max(0, visibleLecturers.length * (cardWidth + CARD_GAP) - CARD_GAP - stripWidth);

  function moveStrip(direction) {
    const step = Math.max(1, Math.floor(stripWidth / (cardWidth + CARD_GAP))) * (cardWidth + CARD_GAP);
    const x = Math.min(stripEnd, Math.max(0, stripOffset + direction * step));
    lecturerScroll.current?.scrollTo({ x, animated: true });
  }

  function resetStrip() {
    setStripOffset(0);
    lecturerScroll.current?.scrollTo({ x: 0, animated: false });
  }

  function searchLecturers(value) {
    setSearch(value);
    resetStrip();
  }

  function sortLecturers(id) {
    setSortId(id);
    setSortOpen(false);
    resetStrip();
  }

  function renderLecturer(lecturer) {
    const selected = compareIds.includes(lecturer._id);
    return (
      <View key={lecturer._id} style={wide && { width: cardWidth }}>
        <Pressable accessibilityRole="button" accessibilityLabel={'Xem chi tiết ' + lecturer.Fullname}
          onPress={() => showDetails(lecturer)}
          style={({ pressed, hovered }) => [styles.lecturer, !wide && styles.mobileLecturer,
            hovered && styles.lecturerHover, pressed && styles.dim]}>
          <Image accessibilityLabel={lecturer.Fullname} source={{ uri: lecturer.Image }}
            style={wide ? styles.lecturerImage : styles.mobilePortrait} />
          <View style={wide ? styles.lecturerDetails : styles.mobileLecturerDetails}>
            <Text numberOfLines={2} style={wide ? styles.lecturerName : styles.mobileLecturerName}>{lecturer.Fullname}</Text>
            <Text style={styles.lecturerCode}>{lecturer.IDGV}</Text>
            {wide && (
              <View style={styles.classFooter}>
                <Text style={styles.classCaption}>Tổng số lớp</Text>
                <Text style={[styles.classCount, lecturer.SumClass === 0 && styles.classCountEmpty]}>
                  {integer.format(lecturer.SumClass)}
                </Text>
              </View>
            )}
          </View>
          {!wide && (
            <Text style={[styles.classCount, lecturer.SumClass === 0 && styles.classCountEmpty]}>
              {integer.format(lecturer.SumClass)} lớp
            </Text>
          )}
        </Pressable>
        {compareMode && (
          <Button variant={selected ? 'primary' : 'secondary'}
            disabled={compareIds.length >= 4 && !selected} onPress={() => toggleCompare(lecturer._id)}>
            {selected ? 'Bỏ chọn ' : 'Chọn '}{lecturer.IDGV}
          </Button>
        )}
      </View>
    );
  }

  if (!token) {
    return (
      <AppBackground login>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.loginPage, wide && styles.loginPageWide,
            wide && { paddingRight: Math.max(28, (width - 1106) / 2) }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.panel, styles.loginPanel]}>
            <Text style={styles.brand}>Quản lý giảng viên</Text>
            <Text accessibilityRole="header" style={styles.title}>Đăng nhập quản trị</Text>
            <Field label="Tên đăng nhập" value={username} onChangeText={setUsername} autoCapitalize="none" />
            <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={busy ? undefined : login} />
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Button onPress={login} disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
          </View>
        </ScrollView>
      </AppBackground>
    );
  }

  return (
    <AppBackground compact={!wide}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, !wide && styles.mobilePage]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={[styles.title, !wide && styles.titleCompact]}>QUẢN LÝ GIẢNG VIÊN</Text>
            <Text style={styles.schoolName}>TRƯỜNG ĐẠI HỌC SƯ PHẠM - ĐẠI HỌC ĐÀ NẴNG</Text>
          </View>
          <Button variant="secondary" disabled={busy} onPress={logout}>Đăng xuất</Button>
        </View>
        {!!error && !operation && <Text accessibilityRole="alert" style={[styles.error, styles.pageNotice]}>{error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={[styles.success, styles.pageNotice]}>{message}</Text>}
        <View style={[styles.dashboard, !wide && styles.mobileDashboard]}>
          <View style={[styles.rail, !wide && styles.mobileRail]}>
            {operations.map(item => (
              <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label}
                disabled={busy || loading} onPress={() => openOperation(item.id)}
                style={({ pressed }) => [styles.railButton, !wide && styles.mobileRailButton, (pressed || operation === item.id) && styles.categorySelected]}>
                <Text style={[styles.railIcon, !wide && styles.mobileRailIcon]}>{item.icon}</Text>
                {!wide && <Text numberOfLines={1} style={styles.mobileRailLabel}>{item.compact}</Text>}
              </Pressable>
            ))}
          </View>
          <View style={[styles.catalog, !wide && styles.mobileCatalog]}>
            <View style={styles.categoryPanel}>
              <Text accessibilityRole="header" style={[styles.categoryHeading, !wide && styles.mobileCategoryHeading]}>Nhóm theo số lớp</Text>
              <View style={styles.categoryGrid}>
                {categories.map(item => (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label}
                    accessibilityState={{ selected: category === item.id }}
                    onPress={() => { setCategory(item.id); searchLecturers(''); }}
                    style={[styles.categoryTile, !wide && styles.mobileCategoryTile,
                      category === item.id && styles.categorySelected]}>
                    {wide && (
                      <View style={styles.categoryIcon}>
                        <Text style={styles.categoryIconText}>{item.icon}</Text>
                      </View>
                    )}
                    <Text style={[styles.categoryLabel, !wide && styles.mobileCategoryLabel]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={[styles.panel, styles.lecturerPanel, !wide && styles.mobileLecturerPanel]}>
              <View style={styles.stripHeader}>
                <Text accessibilityRole="header" style={[styles.stripHeading, !wide && styles.mobileStripHeading]}>Danh sách giảng viên</Text>
                {wide && stripWidth > 0 && stripEnd > 1 && (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Giảng viên trước"
                      disabled={stripOffset <= 1} onPress={() => moveStrip(-1)}
                      style={[styles.arrow, stripOffset <= 1 && styles.dim]}>
                      <Text style={styles.arrowText}>‹</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Giảng viên tiếp theo"
                      disabled={stripOffset >= stripEnd - 1} onPress={() => moveStrip(1)}
                      style={[styles.arrow, stripOffset >= stripEnd - 1 && styles.dim]}>
                      <Text style={styles.arrowText}>›</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <View style={styles.filters}>
                <View style={styles.searchField}>
                  <Field label="Tìm theo mã hoặc tên" inputStyle={styles.catalogInput} placeholder="Ví dụ: GV001" value={search} onChangeText={searchLecturers} />
                </View>
                {wide ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={'Sắp xếp, ' + sortOption.label}
                    accessibilityState={{ expanded: sortOpen }} onPress={() => setSortOpen(current => !current)}
                    style={({ pressed }) => [styles.button, styles.sortButton, pressed && styles.dim]}>
                    <Text style={styles.sortButtonText}>{sortId === 'default' ? 'Sắp xếp' : sortOption.label} {sortOpen ? '▴' : '▾'}</Text>
                  </Pressable>
                ) : (
                  <Button variant={toolsOpen ? 'primary' : 'secondary'} onPress={() => setToolsOpen(current => !current)}>
                    Tùy chọn
                  </Button>
                )}
              </View>
              {(wide || toolsOpen) && (
                <View style={styles.actions}>
                  {!wide && (
                    <Pressable accessibilityRole="button" accessibilityLabel={'Sắp xếp, ' + sortOption.label}
                      accessibilityState={{ expanded: sortOpen }} onPress={() => setSortOpen(current => !current)}
                      style={({ pressed }) => [styles.button, styles.sortButton, pressed && styles.dim]}>
                      <Text style={styles.sortButtonText}>{sortId === 'default' ? 'Sắp xếp' : sortOption.label} {sortOpen ? '▴' : '▾'}</Text>
                    </Pressable>
                  )}
                  <Button variant={filterOpen ? 'primary' : 'secondary'} onPress={() => setFilterOpen(current => !current)}>Lọc nâng cao</Button>
                  <Button variant={compareMode ? 'primary' : 'secondary'} onPress={() => setCompareMode(current => !current)}>Chọn để so sánh</Button>
                  <Button variant="secondary" disabled={busy || loading || !visibleLecturers.length} onPress={downloadCsv}>Xuất CSV</Button>
                  {hasFilters && <Button variant="secondary" onPress={clearFilters}>Xóa bộ lọc</Button>}
                </View>
              )}
              {selectedLecturers.length > 0 && (
                <View style={styles.actions}>
                  <Button disabled={selectedLecturers.length < 2} onPress={() => openOperation('compare')}>
                    So sánh ({selectedLecturers.length}/4)
                  </Button>
                  <Button variant="secondary" onPress={() => setCompareIds([])}>Bỏ chọn</Button>
                </View>
              )}
              {filterOpen && (wide || toolsOpen) && (
                <View style={styles.advancedFilters}>
                  <View style={styles.rangeField}>
                    <Field label="Số lớp từ" value={minClasses} keyboardType="number-pad"
                      onChangeText={value => { setMinClasses(value); resetStrip(); }} />
                  </View>
                  <View style={styles.rangeField}>
                    <Field label="Số lớp đến" value={maxClasses} keyboardType="number-pad"
                      onChangeText={value => { setMaxClasses(value); resetStrip(); }} />
                  </View>
                </View>
              )}
              {rangeInvalid && <Text accessibilityRole="alert" style={styles.error}>Nhập khoảng số lớp hợp lệ, từ thấp đến cao.</Text>}
              {sortOpen && (wide || toolsOpen) && (
                <View style={styles.actions}>
                  {sortOptions.map(option => (
                    <Pressable key={option.id} accessibilityRole="button"
                      accessibilityState={{ selected: sortId === option.id }} onPress={() => sortLecturers(option.id)}
                      style={[styles.button, sortId === option.id ? styles.categorySelected : styles.secondary]}>
                      <Text style={styles.buttonText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {loading && <Text style={styles.muted}>Đang tải giảng viên…</Text>}
              {!loading && !visibleLecturers.length && <Text style={styles.muted}>{hasFilters ? 'Không tìm thấy giảng viên phù hợp.' : 'Chưa có giảng viên.'}</Text>}
              {wide ? (
                <ScrollView horizontal ref={lecturerScroll} accessibilityLabel="Dải giảng viên cuộn ngang"
                  style={styles.strip} contentContainerStyle={styles.stripContent} keyboardShouldPersistTaps="handled"
                  onLayout={event => setStripWidth(event.nativeEvent.layout.width)}
                  onScroll={event => setStripOffset(event.nativeEvent.contentOffset.x)} scrollEventThrottle={32}>
                    {visibleLecturers.map(renderLecturer)}
                </ScrollView>
              ) : (
                <View style={styles.mobileList} accessibilityLabel="Danh sách giảng viên cuộn dọc">
                  {visibleLecturers.map(renderLecturer)}
                </View>
              )}
            </View>
          </View>
        </View>
        <Modal visible={!!operation} transparent animationType="fade"
          onRequestClose={busy ? undefined : closeOperation}>
          <View style={styles.modalOverlay}>
            <View style={[styles.panel, styles.dialog, (showCharts || showCompare) && styles.chartDialog]} accessibilityViewIsModal>
              <Text accessibilityRole="header" style={styles.heading}>{detail ? 'Chi tiết giảng viên' : showCompare ? 'So sánh giảng viên' : activeOperation?.label}</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogBody}>
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                {detail && (
                  <>
                    <Image accessibilityLabel={'Ảnh ' + detail.Fullname} source={{ uri: detail.Image }} style={styles.detailImage} />
                    <Text style={styles.heading}>{detail.Fullname}</Text>
                    <Text style={styles.lecturerCode}>{detail.IDGV}</Text>
                    <Text style={styles.label}>Tổng số lớp {integer.format(detail.SumClass)}</Text>
                  </>
                )}
                {showCompare && <CompareLecturers selected={selectedLecturers} />}
                {showBackup && (
                  <>
                    <Text style={styles.muted}>Tải bản sao có đủ ảnh hoặc chọn tệp JSON tối đa 32 MB. Khi có mã trùng và dữ liệu khác, bạn có thể đối chiếu rồi chọn cập nhật từng hồ sơ.</Text>
                    <View style={styles.actions}>
                      <Button variant="secondary" disabled={busy} onPress={downloadBackup}>Tải GiangVien.json</Button>
                      <Button variant="secondary" disabled={busy} onPress={chooseBackup}>Chọn tệp JSON</Button>
                    </View>
                    {backup && (
                      <View style={styles.chartCard}>
                        <Text style={styles.label}>{backup.name}</Text>
                        <Text style={styles.muted}>Tổng số bản ghi {integer.format(backup.total)}</Text>
                        <Text style={styles.success}>Có thể nhập {integer.format(backup.valid)}</Text>
                        <Text style={styles.muted}>Trùng {integer.format(backup.duplicates)}</Text>
                        <Text style={styles.error}>Lỗi {integer.format(backup.invalid)}</Text>
                        {!!backup.issues.length && <Text style={styles.muted}>Vị trí bản ghi lỗi trong mảng, tính từ 1 · {backup.issues.join(', ')}{backup.invalid > backup.issues.length ? '…' : ''}</Text>}
                      </View>
                    )}
                  </>
                )}
                {showBackup && backup?.conflicts.map(conflict => (
                  <ImportConflict key={conflict.id} conflict={conflict} update={backup.updateIds.includes(conflict.id)}
                    onSelect={update => selectImportUpdate(conflict.id, update)} />
                ))}
                {showCharts && <LecturerCharts lecturers={lecturers} wide={wide} />}
                {chooseProduct && (
                  <>
                    <Text style={styles.label}>Chọn giảng viên trong nhóm đang xem</Text>
                    {!visibleLecturers.length && <Text style={styles.muted}>Không có giảng viên để chọn.</Text>}
                    {visibleLecturers.map(lecturer => (
                      <Pressable key={lecturer._id} accessibilityRole="button" accessibilityLabel={lecturer.Fullname}
                        style={styles.lecturerChoice} onPress={() => operation === 'edit' ? startEditing(lecturer) : setRemoving(lecturer)}>
                        <Image source={{ uri: lecturer.Image }} style={styles.choiceImage} />
                        <Text style={styles.choiceName}>{lecturer.Fullname}</Text>
                        <Text style={styles.muted}>{lecturer.IDGV}</Text>
                      </Pressable>
                    ))}
                  </>
                )}
                {showForm && (
                  <>
                    <Field label="Mã giảng viên" maxLength={32} autoCapitalize="characters" value={form.IDGV} onChangeText={value => change('IDGV', value)} />
                    <Field label="Họ và tên" maxLength={120} value={form.Fullname} onChangeText={value => change('Fullname', value)} />
                    <Field label="Tổng số lớp" keyboardType="number-pad" value={form.SumClass} onChangeText={value => change('SumClass', value)} />
                    {!!form.Image && <Image accessibilityLabel="Ảnh xem trước" source={{ uri: form.Image }} style={styles.preview} />}
                  </>
                )}
                {removing && <Text style={styles.error}>Xóa {removing.Fullname}?</Text>}
              </ScrollView>
              <View style={styles.actions}>
                {showForm && (
                  <>
                    <Button variant="secondary" disabled={busy} onPress={pickImage}>{form.Image ? 'Đổi ảnh' : 'Chọn ảnh'}</Button>
                    <Button disabled={busy} onPress={save}>{editing ? 'Lưu thay đổi' : 'Lưu giảng viên'}</Button>
                  </>
                )}
                {showBackup && backup && (backup.valid > 0 || backup.updateIds.length > 0) && (
                  <Button disabled={busy} onPress={importBackup}>Xác nhận nhập</Button>
                )}
                {removing && <Button variant="danger" disabled={busy} onPress={removeLecturer}>Xác nhận xóa</Button>}
                {detail && (
                  <>
                    <Button variant="secondary" disabled={compareIds.length >= 4 && !compareIds.includes(detail._id)}
                      onPress={() => toggleCompare(detail._id)}>
                      {compareIds.includes(detail._id) ? 'Bỏ khỏi so sánh' : 'Thêm vào so sánh'}
                    </Button>
                    {selectedLecturers.length >= 2 && (
                      <Button onPress={() => openOperation('compare')}>Xem so sánh ({selectedLecturers.length}/4)</Button>
                    )}
                  </>
                )}
                <Button variant="secondary" disabled={busy} onPress={closeOperation}>Đóng</Button>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#0b496c' },
  backgroundLayer: { ...StyleSheet.absoluteFill, zIndex: 0 },
  foreground: { flex: 1, minHeight: 0, position: 'relative', zIndex: 1 },
  backgroundImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  mobileScreen: { backgroundColor: '#edf4f2' },
  mobileBackgroundImage: { height: 280, opacity: 0.18 },
  scroll: { flex: 1 },
  backgroundShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5, 28, 50, 0.42)' },
  loginShade: { backgroundColor: 'rgba(5, 28, 50, 0.16)' },
  loginPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  loginPageWide: { justifyContent: 'center', alignItems: 'flex-end', paddingTop: 128, paddingBottom: 28 },
  loginPanel: { width: '100%', maxWidth: 410, padding: 28, backgroundColor: 'rgba(255, 255, 255, 0.96)' },
  page: { width: '100%', maxWidth: 1150, alignSelf: 'center', padding: 22, paddingTop: Platform.OS === 'web' ? 32 : 54, gap: 18 },
  mobilePage: { paddingHorizontal: 12, paddingBottom: 36, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 10 : Platform.OS === 'ios' ? 56 : 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.94)' },
  headerText: { flexShrink: 1, gap: 4 },
  titleCompact: { fontSize: 19 },
  schoolName: { color: '#12594e', fontWeight: '700', fontSize: 12, lineHeight: 17 },
  brand: { color: '#12594e', fontWeight: '700', fontSize: 12, letterSpacing: 1.6 },
  title: { fontSize: 30, fontWeight: '800', color: '#102334' },
  heading: { fontSize: 19, fontWeight: '700', color: '#102334' },
  panel: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#dce5eb', padding: 18, gap: 14 },
  mobileLecturerPanel: { padding: 12, gap: 10 },
  mobileStripHeading: { fontSize: 18 },
  lecturerPanel: { backgroundColor: '#f8fbfa', borderColor: '#d4e3df' },
  stripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stripHeading: { flexShrink: 1, color: '#18343b', fontSize: 22, fontWeight: '800' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#e6f2ee' },
  arrowText: { color: '#205d51', fontSize: 25, lineHeight: 28, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 },
  searchField: { flexBasis: 200, flexGrow: 1, minWidth: 0, maxWidth: 410 },
  catalogInput: { backgroundColor: '#ffffff', borderColor: '#b9d1ca', borderRadius: 10 },
  sortButton: { backgroundColor: '#205d51', borderRadius: 10 },
  sortButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  advancedFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rangeField: { flexGrow: 1, flexBasis: 105, maxWidth: 190 },
  compareRow: { flexDirection: 'row', gap: 10 },
  compareCard: { width: 152, borderWidth: 1, borderColor: '#d8e4e0', borderRadius: 10, padding: 10, gap: 5 },
  compareImage: { width: '100%', aspectRatio: 1, resizeMode: 'contain', borderRadius: 6, backgroundColor: '#edf2f1' },
  diffColumn: { flex: 1, minWidth: 0, gap: 4, padding: 8, backgroundColor: '#f1f6f4', borderRadius: 8 },
  strip: { minWidth: 0 },
  stripContent: { gap: CARD_GAP, paddingBottom: 8, alignItems: 'flex-start' },
  dashboard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mobileDashboard: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  mobileCatalog: { flex: 0, gap: 10 },
  mobileRail: { flexDirection: 'row', justifyContent: 'space-between', padding: 4, gap: 1 },
  mobileRailButton: { flex: 1, width: 'auto', height: 50, gap: 2 },
  mobileRailIcon: { fontSize: 18, lineHeight: 21 },
  mobileRailLabel: { color: '#12594e', fontSize: 10, fontWeight: '600' },
  catalog: { flex: 1, minWidth: 0, gap: 16 },
  rail: { padding: 4, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dce5eb', borderRadius: 14, gap: 4 },
  railButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  railIcon: { fontSize: 23, color: '#12594e', lineHeight: 29 },
  categoryPanel: { borderWidth: 1, borderColor: '#dce5eb', borderRadius: 16, overflow: 'hidden', backgroundColor: '#ffffff' },
  categoryHeading: { padding: 16, color: '#102334', fontWeight: '700', fontSize: 18 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  categoryTile: { width: '25%', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 96, padding: 6, borderTopWidth: 1, borderRightWidth: 1, borderColor: '#e7edf0' },
  mobileCategoryHeading: { padding: 10, fontSize: 14 },
  mobileCategoryTile: { minHeight: 44, padding: 4, gap: 0 },
  mobileCategoryLabel: { fontSize: 11 },
  categorySelected: { backgroundColor: '#dcf3eb' },
  categoryIcon: { backgroundColor: '#f1f5f6', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  categoryIconText: { color: '#21384b', fontSize: 15, fontWeight: '600', includeFontPadding: false },
  categoryLabel: { textAlign: 'center', fontSize: 13, color: '#21384b', fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(16,35,52,0.55)' },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '90%' },
  dialogBody: { gap: 12 },
  chartDialog: { maxWidth: 800 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, padding: 10, gap: 4, borderRadius: 8, backgroundColor: '#ecf6f3' },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#12594e' },
  chartGrid: { gap: 12 },
  chartGridWide: { flexDirection: 'row' },
  chartCard: { flex: 1, minWidth: 0, gap: 10, borderWidth: 1, borderColor: '#dce5eb', borderRadius: 10, padding: 12 },
  chartTitle: { color: '#102334', fontWeight: '700', fontSize: 15 },
  chartRow: { gap: 4 },
  chartRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chartLabel: { flexShrink: 1, color: '#263c4e', fontSize: 13 },
  chartValue: { color: '#102334', fontWeight: '700', fontSize: 13 },
  donutGraphic: { alignSelf: 'center', width: 128, height: 128 },
  donutCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  donutCaption: { color: '#4e6073', fontSize: 12 },
  legendLabel: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  columnPlot: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingBottom: 8 },
  chartColumn: { minWidth: 40, alignItems: 'center', gap: 5 },
  columnTrack: { height: 116, justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  columnBar: { width: 21, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  columnLabel: { color: '#4e6073', fontSize: 11 },
  barTrack: { height: 8, overflow: 'hidden', borderRadius: 5, backgroundColor: '#edf1f4' },
  barFill: { height: '100%', borderRadius: 5 },
  lecturerChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#e7edf0' },
  choiceImage: { width: 40, height: 40, resizeMode: 'contain', backgroundColor: '#f1f5f9', borderRadius: 6 },
  choiceName: { flex: 1, color: '#102334', fontWeight: '600' },
  field: { gap: 5 },
  label: { color: '#263c4e', fontWeight: '600', fontSize: 14 },
  input: { color: '#102334', borderWidth: 1, borderColor: '#b8c7d4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, fontSize: 15 },
  button: { borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#10594e' },
  secondary: { backgroundColor: '#e9f0f5' },
  danger: { backgroundColor: '#fbe9e9' },
  buttonText: { color: '#21384b', fontWeight: '700', fontSize: 14 },
  primaryText: { color: '#ffffff' },
  dim: { opacity: 0.65 },
  lecturer: { borderWidth: 1, borderColor: '#d8e4e0', borderRadius: 14, overflow: 'hidden', backgroundColor: '#ffffff' },
  mobileList: { gap: 8 },
  mobileLecturer: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 10 },
  mobilePortrait: { width: 58, height: 58, borderRadius: 8, resizeMode: 'cover', backgroundColor: '#eaf2ef' },
  mobileLecturerDetails: { flex: 1, minWidth: 0, gap: 4 },
  mobileLecturerName: { color: '#18343b', fontWeight: '700', fontSize: 14, lineHeight: 18 },
  lecturerHover: { borderColor: '#4c9787' },
  lecturerImage: { width: '100%', aspectRatio: 1, resizeMode: 'contain', backgroundColor: '#eaf2ef' },
  lecturerDetails: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  lecturerName: { color: '#18343b', fontWeight: '700', fontSize: 15, lineHeight: 19, height: 38 },
  lecturerCode: { color: '#4d686e', fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  classFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderColor: '#e6eeeb' },
  classCaption: { color: '#4d686e', fontSize: 12, flexShrink: 1 },
  classCount: { minWidth: 30, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7, textAlign: 'center', color: '#17594a', backgroundColor: '#e3f3ed', fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
  classCountEmpty: { color: '#4d686e', backgroundColor: '#edf2f1' },
  muted: { color: '#4e6073' },
  detailImage: { width: '100%', height: 280, resizeMode: 'contain', backgroundColor: '#f6f4f2', borderRadius: 10 },
  preview: { width: '100%', height: 125, resizeMode: 'contain', backgroundColor: '#f1f5f9', borderRadius: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pageNotice: { padding: 10, borderRadius: 8, backgroundColor: '#ffffff' },
  error: { color: '#a02532', fontWeight: '600' },
  success: { color: '#12594e', fontWeight: '600' },
});
