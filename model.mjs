export const VERSION = 1;
export const POPULARITY = ['俺だけの', '一部の', '大抵の', 'みんなの'];
export const COLORS = ['blue', 'gray', 'green', 'purple', 'pink', 'orange'];
export const RANGE_FIELDS = [['chest', '最高音（地声）'], ['falsetto', '最高音（裏声）'], ['lowest', '最低音']];
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const DEFAULT_THEME = {background:[242,245,247],accent:[144,200,224]};
export const id = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').trim();
export const uniq = values => [...new Set(values.map(x => x.trim()).filter(Boolean))];
export const activeSongs = state => state.songs.filter(song => !song.deletedAt);
export const categoryOf = (state, value) => state.categories.find(category => category.id === value);

export function initialState() {
  return {
    schemaVersion: VERSION, revision: 0, modifiedAt: new Date().toISOString(),
    lastExportAt: null, lastExportRevision: -1,
    categories: ['一八番', '好き', '歌える', '練習中', 'いつの日か'].map((label, i) => ({id: `category-${i}`, label, color: COLORS[i]})),
    songs: [], preferences: {lyricsFont: 20, theme: clone(DEFAULT_THEME)}
  };
}

export function emptySong() {
  const time = new Date().toISOString();
  return {
    id: id(), title: '', categoryId: '', genres: [], popularity: '',
    ranges: Object.fromEntries(RANGE_FIELDS.map(([key]) => [key, {pitch: '', context: '', target: '', start: -1}])),
    keyNote: '', artists: [], year: '', memories: [], lyrics: '', notes: '',
    createdAt: time, updatedAt: time, deletedAt: null
  };
}

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}の形式が正しくありません。`);
  return value;
}
function text(value, label, max = 500) {
  if (typeof value !== 'string' || value.length > max) fail(`${label}の文字数または形式が正しくありません。`);
  return value;
}
function validId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('識別番号の形式が正しくありません。');
  return value;
}
function date(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label}の形式が正しくありません。`);
  return value;
}
function list(value, label) {
  if (!Array.isArray(value) || value.length > 100) fail(`${label}の件数または形式が正しくありません。`);
  return uniq(value.map(item => text(item, label, 150)));
}

export function validateState(input) {
  const raw = object(input, 'データ');
  if (raw.schemaVersion !== VERSION) fail('このデータのバージョンには対応していません。新しいOHAKOでお試しください。');
  if (!Array.isArray(raw.categories) || raw.categories.length > 100) fail('分類の形式が正しくありません。');
  const categoryIds = new Set(), categoryNames = new Set();
  const categories = raw.categories.map(value => {
    const category = object(value, '分類');
    const categoryId = validId(category.id), label = text(category.label, '分類名', 80).trim();
    if (!label || categoryIds.has(categoryId) || categoryNames.has(normalize(label)) || !COLORS.includes(category.color)) fail('分類名・色・識別番号が重複しているか、正しくありません。');
    categoryIds.add(categoryId); categoryNames.add(normalize(label));
    return {id: categoryId, label, color: category.color};
  });
  if (!Array.isArray(raw.songs) || raw.songs.length > 10000) fail('楽曲の形式が正しくないか、10,000曲を超えています。');
  const songIds = new Set();
  const songs = raw.songs.map(value => {
    const song = object(value, '楽曲'), songId = validId(song.id);
    if (songIds.has(songId)) fail('楽曲の識別番号が重複しています。');
    songIds.add(songId);
    const title = text(song.title, '曲名', 500).trim();
    if (!title) fail('曲名が空の楽曲があります。');
    if (song.categoryId !== '' && !categoryIds.has(song.categoryId)) fail('楽曲に存在しない分類が指定されています。');
    if (song.popularity !== '' && !POPULARITY.includes(song.popularity)) fail('知名度の分類が正しくありません。');
    const year = text(song.year, '西暦', 4);
    if (year && !/^\d{4}$/.test(year)) fail('西暦は4桁で入力してください。');
    const rangesRaw = object(song.ranges, '音域メモ');
    const ranges = Object.fromEntries(RANGE_FIELDS.map(([key]) => {
      const range = object(rangesRaw[key], '音域メモ');
      const pitch = text(range.pitch, '音高', 100), context = text(range.context, '付近の歌詞', 5000), target = text(range.target, '該当文字', 5000);
      let start = range.start;
      if (!Number.isInteger(start) || start < -1 || start > context.length) fail('歌詞の選択位置が正しくありません。');
      if (start >= 0 && context.slice(start, start + target.length) !== target) start = context.indexOf(target);
      return [key, {pitch, context, target, start}];
    }));
    return {
      id: songId, title, categoryId: song.categoryId, popularity: song.popularity,
      genres: list(song.genres, 'ジャンル'), memories: list(song.memories, '思い出'), artists: list(song.artists, 'アーティスト'),
      ranges, keyNote: text(song.keyNote, 'キー変更メモ', 5000), year,
      lyrics: text(song.lyrics, '歌詞', 200000), notes: text(song.notes, 'その他メモ', 50000),
      createdAt: date(song.createdAt, '作成日'), updatedAt: date(song.updatedAt, '更新日'), deletedAt: date(song.deletedAt, '削除日', true)
    };
  });
  const preferences = object(raw.preferences, '設定');
  if (![16, 18, 20, 24, 28].includes(preferences.lyricsFont)) fail('文字サイズの設定が正しくありません。');
  return {
    schemaVersion: VERSION, songs, categories, preferences: {lyricsFont: preferences.lyricsFont, theme: validateTheme(preferences.theme)},
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    modifiedAt: date(raw.modifiedAt, 'データの更新日'),
    lastExportAt: raw.lastExportAt ? date(raw.lastExportAt, '書き出し日') : null,
    lastExportRevision: Number.isSafeInteger(raw.lastExportRevision) ? raw.lastExportRevision : -1
  };
}

export function validateTheme(theme) {
  if (theme === undefined) return clone(DEFAULT_THEME);
  object(theme,'テーマカラー');
  return Object.fromEntries(['background','accent'].map(key => {
    if (!Array.isArray(theme[key]) || theme[key].length !== 3 || theme[key].some(value => !Number.isInteger(value) || value < 0 || value > 255)) fail('テーマカラーのRGBは、0〜255の整数で指定してください。');
    return [key,[...theme[key]]];
  }));
}
const mix = (a,b,weight) => a.map((value,index) => Math.round(value * (1-weight) + b[index]*weight));
const rgb = color => `rgb(${color.join(', ')})`;
const luminance = color => color.map(value => { const n=value/255; return n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4; }).reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const readable = color => [[30,47,58],[255,255,255],[0,0,0]].find(candidate => contrast(color,candidate)>=4.5);
export function themeProperties(input) {
  const theme=validateTheme(input), background=theme.background, accent=theme.accent, ink=readable(background), white=[255,255,255];
  const panel=mix(background,white,luminance(background)>.4?.75:.06);
  const accentText=contrast(accent,background)>=4.5 ? accent : readable(background);
  return {
    '--paper':rgb(background),'--white':rgb(panel),'--ink':rgb(ink),
    '--muted':rgb(mix(background,ink,.68)),'--line':rgb(mix(background,ink,.16)),
    '--soft':rgb(mix(background,ink,.045)),'--accent':rgb(accent),
    '--accent-ink':rgb(readable(accent)),'--accent-dark':rgb(mix(accent,readable(accent),.08)),
    '--accent-text':rgb(accentText),'--pale':rgb(mix(background,accent,.2))
  };
}

export function makeBackup(state) {
  return JSON.stringify({format: 'ohako-backup', version: VERSION, exportedAt: new Date().toISOString(), data: validateState(state)}, null, 2);
}
export function readBackup(contents) {
  if (typeof contents !== 'string' || new Blob([contents]).size > MAX_FILE_SIZE) fail('ファイルが大きすぎます（上限25MB）。');
  let input;
  try { input = JSON.parse(contents.replace(/^\uFEFF/, '')); } catch { fail('JSONファイルを読み取れませんでした。'); }
  object(input, 'バックアップ');
  if (input.format !== 'ohako-backup') fail('OHAKOのJSONバックアップではありません。');
  if (input.version !== VERSION) fail('このバックアップのバージョンには対応していません。');
  return {data: validateState(input.data), exportedAt: date(input.exportedAt, '書き出し日')};
}

export function searchSongs(state, query = '', filters = {}, sort = 'updated') {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const songs = activeSongs(state).filter(song => {
    const haystack = normalize([song.title, ...song.artists, ...song.genres, ...song.memories, song.notes, song.keyNote].join(' '));
    if (!words.every(word => haystack.includes(word))) return false;
    if (filters.category && (filters.category === '__unset' ? !!song.categoryId : song.categoryId !== filters.category)) return false;
    if (filters.popularity && song.popularity !== filters.popularity) return false;
    if (filters.year && song.year !== filters.year) return false;
    if (filters.lyrics === 'yes' && !song.lyrics.trim()) return false;
    if (filters.lyrics === 'no' && song.lyrics.trim()) return false;
    if (filters.genres?.length && !filters.genres.some(tag => song.genres.includes(tag))) return false;
    if (filters.memories?.length && !filters.memories.some(tag => song.memories.includes(tag))) return false;
    return true;
  });
  const titleSort = (a, b) => a.title.localeCompare(b.title, 'ja', {numeric: true});
  return songs.sort((a, b) => {
    switch (sort) {
      case 'title': return titleSort(a, b);
      case 'artist': return a.artists.join(' ').localeCompare(b.artists.join(' '), 'ja') || titleSort(a, b);
      case 'created': return b.createdAt.localeCompare(a.createdAt) || titleSort(a, b);
      case 'year': return (Number(b.year) || 0) - (Number(a.year) || 0) || titleSort(a, b);
      case 'category': return (a.categoryId ? state.categories.findIndex(c => c.id === a.categoryId) : 999) - (b.categoryId ? state.categories.findIndex(c => c.id === b.categoryId) : 999) || titleSort(a, b);
      default: return b.updatedAt.localeCompare(a.updatedAt) || titleSort(a, b);
    }
  });
}

export function parseBulk(contents) {
  return contents.split(/\r?\n/).map((line, index) => {
    const [title, ...artists] = line.split('\t');
    return {line: index + 1, title: title.trim(), artists: uniq(artists.flatMap(part => part.split(/[、,]/)))};
  }).filter(item => item.title || item.artists.length);
}

export function csvCell(value) {
  let result = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]/.test(result) || /^[\t\r\n]/.test(result)) result = "'" + result;
  return '"' + result.replaceAll('"', '""') + '"';
}
export function makeCsv(state, includeLyrics = true) {
  const headers = ['曲名', '歌う分類', 'ジャンル', '知名度／流行度', 'キー変更メモ', 'アーティスト', '西暦', '思い出', '最高音（地声）', '最高音（裏声）', '最低音', ...(includeLyrics ? ['歌詞'] : []), 'その他メモ'];
  const rows = activeSongs(state).map(song => [song.title, categoryOf(state, song.categoryId)?.label ?? '', song.genres.join(' / '), song.popularity, song.keyNote, song.artists.join(' / '), song.year, song.memories.join(' / '), ...RANGE_FIELDS.map(([key]) => {
    const r = song.ranges[key]; return [r.pitch, r.context, r.target && `該当文字：${r.target}`].filter(Boolean).join(' | ');
  }), ...(includeLyrics ? [song.lyrics] : []), song.notes]);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function excerptMarkup(range) {
  if (!range.target) return e(range.context);
  const start = range.start >= 0 && range.context.slice(range.start, range.start + range.target.length) === range.target ? range.start : range.context.indexOf(range.target);
  if (start < 0) return e(range.context);
  return e(range.context.slice(0, start)) + '<mark>' + e(range.target) + '</mark>' + e(range.context.slice(start + range.target.length));
}

export function samples() {
  const items = [
    ['夜明けのポケット', '灯台レコード', 'category-0', ['Jpop'], 'みんなの', '-2。サビは力を抜いて', '2019', ['帰り道'], '夜明けのポケットに\n小さな声をしまって\n昨日より少し遠くへ\n僕らの朝が始まる'],
    ['透明な星図', '星読み工房', 'category-3', ['ボカロ', 'アニソン'], '一部の', '原曲キー。高音を練習中', '2023', ['学生時代'], '透明な星図を広げ\n名前のない明日を探す'],
    ['あの日のソーダ', '夏色フィルム', 'category-1', ['Jpop'], '大抵の', '', '2014', ['夏休み'], '坂道の先で待ち合わせ\nソーダの泡が空にほどける']
  ];
  return items.map(([title, artist, categoryId, genres, popularity, keyNote, year, memories, lyrics]) => ({...emptySong(), title, artists: [artist], categoryId, genres, popularity, keyNote, year, memories, lyrics, notes: '動作確認用の架空の曲です。曲名・歌詞ともにサンプルです。'}));
}
