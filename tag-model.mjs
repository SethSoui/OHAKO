// Tag names stay on songs; the catalog stores reusable choices and their colors.
// This keeps older exports and plain-text CSV useful without repeating colors per song.
export const TAG_GROUPS = {
  genres: { label: "ジャンル", color: "blue", symbol: "♪" },
  memories: { label: "思い出", color: "purple", symbol: "◇" },
  artists: { label: "アーティスト", color: "pink", symbol: "♫" },
};
export const TAG_COLORS = {
  blue: "水色",
  purple: "紫",
  pink: "ピンク",
  green: "緑",
  orange: "オレンジ",
  gray: "グレー",
};
const GROUP_KEYS = Object.keys(TAG_GROUPS);
const collator = new Intl.Collator("ja", { numeric: true });
const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("ja").trim();

export function emptyCatalog() {
  return {
    genres: [
      { name: "ボカロ", color: "green" },
      { name: "アニソン", color: "purple" },
      { name: "Jpop", color: "blue" },
      { name: "ロック", color: "orange" },
      { name: "バラード", color: "pink" },
    ],
    memories: [],
    artists: [],
  };
}

export function validateCatalog(input, songs) {
  const source = input === undefined ? emptyCatalog() : input;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("タグ設定の形式が正しくありません。");
  }
  return Object.fromEntries(
    Object.entries(TAG_GROUPS).map(([key, group]) => {
      const entries = source[key];
      if (!Array.isArray(entries) || entries.length > 1000000) {
        throw new Error(`${group.label}のタグ設定が正しくありません。`);
      }
      const names = new Set();
      const result = entries.map((entry) => {
        if (
          !entry ||
          typeof entry.name !== "string" ||
          !entry.name.trim() ||
          entry.name.length > 150 ||
          !Object.hasOwn(TAG_COLORS, entry.color) ||
          names.has(entry.name.trim())
        ) {
          throw new Error(`${group.label}のタグ名・色・重複を確認してください。`);
        }
        const name = entry.name.trim();
        names.add(name);
        return { name, color: entry.color };
      });
      // Migrate old files and discover newly typed tags in one pass over songs.
      for (const song of songs) {
        for (const name of song[key]) {
          if (!names.has(name)) {
            result.push({ name, color: group.color });
            names.add(name);
          }
        }
      }
      return [key, result];
    }),
  );
}

export function tagIndex(state) {
  const result = Object.fromEntries(
    GROUP_KEYS.map((key) => [
      key,
      new Map(
        state.tagCatalog[key].map((tag) => [
          tag.name,
          { ...tag, searchName: normalize(tag.name), count: 0, total: 0 },
        ]),
      ),
    ]),
  );
  for (const song of state.songs) {
    for (const key of GROUP_KEYS) {
      for (const name of song[key]) {
        const item = result[key].get(name);
        if (item) {
          item.total++;
          if (!song.deletedAt) item.count++;
        }
      }
    }
  }
  return result;
}

export function findTags(index, key, query = "", { limit = 8, offset = 0 } = {}) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = [...index[key].values()]
    .filter((tag) => words.every((word) => tag.searchName.includes(word)))
    .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
  return { total: matches.length, tags: matches.slice(offset, offset + limit) };
}

export function addCatalogTag(state, key, name, color = TAG_GROUPS[key]?.color) {
  const group = TAG_GROUPS[key];
  name = name.trim();
  if (
    !group ||
    !name ||
    name.length > 150 ||
    /[,、\n\r]/.test(name) ||
    !Object.hasOwn(TAG_COLORS, color)
  ) {
    throw new Error("タグ名は区切り文字を含めず、1〜150文字で入力してください。");
  }
  if (state.tagCatalog[key].some((tag) => normalize(tag.name) === normalize(name))) {
    throw new Error("同じ名前のタグがすでにあります。");
  }
  state.tagCatalog[key].push({ name, color });
}

export function removeCatalogTag(state, key, name) {
  if (!Object.hasOwn(TAG_GROUPS, key)) throw new Error("タグの種類が正しくありません。");
  const definition = state.tagCatalog[key].find((tag) => tag.name === name);
  if (!definition) throw new Error("タグが見つかりません。");
  const assignments = [];
  for (const song of state.songs) {
    const position = song[key].indexOf(name);
    if (position < 0) continue;
    assignments.push({ id: song.id, position });
    song[key] = song[key].filter((value) => value !== name);
  }
  state.tagCatalog[key] = state.tagCatalog[key].filter((tag) => tag.name !== name);
  return { key, definition: { ...definition }, assignments };
}

export function restoreCatalogTag(state, removal) {
  const { key, definition, assignments } = removal;
  const affected = new Map(assignments.map((value) => [value.id, value.position]));
  for (const song of state.songs) {
    if (!affected.has(song.id) || song[key].includes(definition.name)) continue;
    if (song[key].length >= 100) throw new Error("タグが100件ある曲があり、元に戻せません。");
    song[key].splice(Math.min(affected.get(song.id), song[key].length), 0, definition.name);
  }
  if (!state.tagCatalog[key].some((tag) => tag.name === definition.name)) {
    state.tagCatalog[key].push({ ...definition });
  }
}
