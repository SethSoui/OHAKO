import {
  POPULARITY,
  RANGE_FIELDS,
  COLORS,
  MAX_FILE_SIZE,
  DEFAULT_THEME,
  validateTheme,
  themeProperties,
  id,
  clone,
  e,
  normalize,
  uniq,
  emptySong,
  activeSongs,
  categoryOf,
  validateState,
  makeBackup,
  readBackup,
  searchSongs,
  parseBulk,
  makeCsv,
  excerptMarkup,
  samples,
} from "./model.mjs";
import { openStorage, ConflictError } from "./storage.mjs";
import { icon, dateLabel, badge, options, back, title, hexColor, html } from "./ui.mjs";
import { settingsMarkup as renderSettings, themeEditorMarkup } from "./settings-view.mjs";
import { TAG_GROUPS } from "./tag-model.mjs";
import {
  selectedTagsMarkup,
  tagSuggestionsMarkup,
  tagPills,
  filterTagChoices,
} from "./tag-view.mjs";
import { editorMarkup } from "./editor-view.mjs";
import { createTagController } from "./tag-controller.mjs";
import {
  PAGE_SIZE,
  ICON_LABELS,
  categoryIcon,
  categoryMarker,
  pageOf,
  compactRows,
  installMarquees,
} from "./list-view.mjs";

const $ = (selector) => document.querySelector(selector);
const root = $("#content");
let store,
  state,
  editor = null,
  draftTimer,
  toastTimer,
  registration,
  wakeLock;
let route = "",
  routeToken = 0,
  listScroll = 0,
  busy = false,
  offlineReady = false;
let newDraft = null,
  rollbackAvailable = false;
let themeDraft = null;
let listPage = 0,
  stopMarquees = () => {},
  searchTimer,
  appearanceDraft;
let query = "",
  sort = "updated",
  filters = {},
  filterWorking = {};
let filterTagQueries = {},
  filterTagPages = {};
let bulkText = "",
  bulkRows = [],
  bulkCategory = "",
  bulkGenres = "",
  bulkMemories = "";
const splitTags = (value) => uniq(value.split(/[,、\n]/));
const draftKey = (value) => (value.isNew ? "draft:new" : `draft:${value.song.id}`);
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast${error ? " error" : ""}`;
  node.hidden = false;
  toastTimer = setTimeout(
    () => {
      node.hidden = true;
    },
    error ? 9000 : 4500,
  );
}
function modal({
  title: heading,
  message = "",
  html = "",
  confirm = "続ける",
  danger = false,
  cancel = "キャンセル",
}) {
  const dialog = $("#modal");
  if (dialog.open) dialog.close("cancel");
  $("#modal-content").innerHTML =
    `<h2 id="modal-title">${e(heading)}</h2><div class="modal-body">${message ? `<p>${e(message)}</p>` : ""}${html}</div><div class="actions"><button class="button secondary" data-modal="cancel">${e(cancel)}</button><button class="button ${danger ? "danger" : "primary"}" data-modal="confirm">${e(confirm)}</button></div>`;
  return new Promise((resolve) => {
    const close = () => {
      dialog.removeEventListener("close", close);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", close);
    dialog.returnValue = "";
    dialog.showModal();
    dialog
      .querySelectorAll("[data-modal]")
      .forEach((button) =>
        button.addEventListener("click", () => dialog.close(button.dataset.modal)),
      );
  });
}
let commitQueue = Promise.resolve();
function commit(change, configuration = {}) {
  const operation = commitQueue.then(async () => {
    const next = clone(state);
    change(next);
    try {
      state = await store.save(next, state.revision, configuration);
      channel?.postMessage("changed");
      return state;
    } catch (error) {
      if (error instanceof ConflictError) state = await store.load();
      throw error;
    }
  });
  commitQueue = operation.catch(() => {});
  return operation;
}

// A small adapter lets the same picker work for one song and for bulk registration.
function tagEditorState() {
  if (route !== "/bulk") return editor;
  return {
    song: {
      get genres() {
        return splitTags(bulkGenres);
      },
      set genres(values) {
        bulkGenres = values.join(", ");
      },
      get memories() {
        return splitTags(bulkMemories);
      },
      set memories(values) {
        bulkMemories = values.join(", ");
      },
    },
  };
}
function scheduleTagDraft() {
  if (route !== "/bulk") {
    scheduleDraft();
    return;
  }
  bulkRows = [];
  if ($("#bulk-results")) $("#bulk-results").innerHTML = "";
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveBulkDraft().catch((error) => toast(error.message, true)), 400);
}
const tagController = createTagController({
  getState: () => state,
  getEditor: tagEditorState,
  commit,
  modal,
  toast,
  renderRoute,
  scheduleDraft: scheduleTagDraft,
  refreshEditor: refreshTagEditor,
});

const channel = "BroadcastChannel" in window ? new BroadcastChannel("ohako-changes") : null;
async function refreshFromStorage() {
  if (!store || !state || busy) return;
  if ((await store.get("revision")) === state.revision) return;
  const latest = await store.load();
  if (latest.revision === state.revision) return;
  state = latest;
  if (editor) toast("別の画面でデータが更新されました。保存時に内容を確認します。");
  else await renderRoute(true);
}
channel?.addEventListener("message", () =>
  refreshFromStorage().catch((error) => toast(error.message, true)),
);

function filterCount() {
  return Object.entries(filters).reduce(
    (n, [, value]) => n + (Array.isArray(value) ? value.length : value ? 1 : 0),
    0,
  );
}
function listMarkup() {
  const songs = activeSongs(state),
    count = songs.length;
  const counts = new Map();
  for (const song of songs) counts.set(song.categoryId, (counts.get(song.categoryId) ?? 0) + 1);
  return html`${title(
      "MY REPERTOIRE",
      "楽曲一覧",
      `<div class="list-heading-side"><span class="count"><strong>${count}</strong>曲</span><button class="icon-button list-help" data-action="list-legend" aria-label="一覧のアイコンの見方">見方</button></div>`,
    )}
    ${newDraft
      ? `<div class="draft-banner"><p>書きかけの曲があります${newDraft.song.title ? `：${e(newDraft.song.title)}` : ""}</p><button class="text-button" data-go="/add">続きを書く</button><button class="icon-button" data-action="discard-new-draft" aria-label="下書きを破棄">×</button></div>`
      : ""}
    <section class="list-controls" aria-label="楽曲を探す">
      <div class="control-label">曲を探す</div>
      <div class="search-row">
        <div class="search-box">
          ${icon("search")}<input
            id="song-search"
            type="search"
            value="${e(query)}"
            placeholder="曲名、歌手、タグから探す"
            aria-label="楽曲を検索"
            autocomplete="off"
          /><button
            class="search-clear"
            data-action="clear-search"
            aria-label="検索をクリア"
            ${query ? "" : " hidden"}
          >
            ×
          </button>
        </div>
        <button
          class="filter-button${filterCount() ? " active" : ""}"
          data-action="filters"
          aria-label="絞り込み条件を設定"
        >
          ${icon("filter")}絞る${filterCount()
            ? `<span class="filter-count">${filterCount()}</span>`
            : ""}
        </button>
      </div>
      <div class="category-strip" aria-label="歌う分類で絞り込み">
        <button
          class="category-chip color-blue${!filters.category ? " selected" : ""}"
          data-action="category-filter"
          data-value=""
          aria-pressed="${!filters.category}"
        >
          すべて<small>${count}</small></button
        >${state.categories
          .map(
            (category) =>
              html`<button
                class="category-chip color-${category.color}${filters.category === category.id
                  ? " selected"
                  : ""}"
                data-action="category-filter"
                data-value="${category.id}"
                aria-pressed="${filters.category === category.id}"
              >
                ${categoryIcon(category.icon)}${e(category.label)}<small
                  >${counts.get(category.id) ?? 0}</small
                >
              </button>`,
          )
          .join("")}<button
          class="category-chip color-gray${filters.category === "__unset" ? " selected" : ""}"
          data-action="category-filter"
          data-value="__unset"
          aria-pressed="${filters.category === "__unset"}"
        >
          未設定<small>${counts.get("") ?? 0}</small>
        </button>
      </div>
    </section>
    <div class="list-toolbar">
      <span id="result-count" role="status"></span
      ><label class="sort-wrap"
        >並べ替え<select id="sort" aria-label="楽曲の並べ替え">
          ${[
            ["updated", "更新した順"],
            ["created", "追加した順"],
            ["title", "曲名順"],
            ["artist", "アーティスト順"],
            ["category", "歌う分類順"],
            ["year", "西暦の新しい順"],
          ]
            .map(
              ([value, label]) =>
                `<option value="${value}"${sort === value ? " selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select></label
      >
    </div>
    <div id="list-results"></div>
    <p class="list-note">
      あなたの曲は、この端末の中に。<br />大切なレパートリーは、設定からバックアップできます。
    </p>`;
}
function updateResults() {
  stopMarquees();
  const songs = searchSongs(state, query, filters, sort),
    all = activeSongs(state).length;
  const page = pageOf(songs, listPage);
  listPage = page.page;
  $("#result-count").textContent =
    `${songs.length}曲${page.pages > 1 ? ` · ${page.start + 1}–${page.end}曲目` : ""}${filterCount() || query ? " · 条件指定中" : ""}`;
  const selector =
    page.pages > 1
      ? `<div class="page-jump"><label>表示ページ<select id="list-page" aria-label="表示ページ">${Array.from({ length: page.pages }, (_, i) => html`<option value="${i}" ${i === page.page ? " selected" : ""}>${i + 1} / ${page.pages}</option>`).join("")}</select></label><span>全曲を対象に検索できます</span></div>`
      : "";
  const pagination =
    page.pages > 1
      ? `<div class="pagination"><button class="button secondary small" data-action="list-page" data-page="${page.page - 1}"${page.page === 0 ? " disabled" : ""}>前の${PAGE_SIZE}曲</button><span>${page.page + 1} / ${page.pages}</span><button class="button secondary small" data-action="list-page" data-page="${page.page + 1}"${page.page === page.pages - 1 ? " disabled" : ""}>次の${PAGE_SIZE}曲</button></div>`
      : "";
  $("#list-results").innerHTML = songs.length
    ? selector +
      compactRows(page.songs, state) +
      pagination +
      (query || filterCount()
        ? '<button class="text-button" data-action="clear-filters">検索・絞り込みをすべて解除</button>'
        : "")
    : `<div class="empty-state"><div class="empty-icon">${icon(all ? "search" : "music")}</div><h2>${all ? "条件に合う曲がありません" : "最初の1曲から、はじめよう。"}</h2><p>${all ? "検索する言葉や、絞り込み条件を変えてみてください。" : "曲名だけでも登録できます。<br>タグや歌詞は、あとからゆっくり。"}</p>${all ? '<button class="button secondary" data-action="clear-filters">条件をすべて解除</button>' : '<button class="button primary" data-go="/add">＋ 最初の曲を追加する</button><br><button class="text-button" data-action="samples">架空のサンプル3曲で試す</button>'}</div>`;
  stopMarquees = installMarquees($("#list-results"), state.preferences.animateTitles);
}

function fontControls() {
  return html`<div class="font-controls">
    <button data-action="font" data-direction="-1" aria-label="歌詞の文字を小さく">A−</button
    ><span>${state.preferences.lyricsFont}</span
    ><button data-action="font" data-direction="1" aria-label="歌詞の文字を大きく">A＋</button>
  </div>`;
}
function detailMarkup(song) {
  const rangeHtml = RANGE_FIELDS.filter(
    ([key]) => song.ranges[key].pitch || song.ranges[key].context || song.ranges[key].target,
  )
    .map(([key, label]) => {
      const range = song.ranges[key];
      return html`<div class="range-display">
        <h3>${label}</h3>
        ${range.pitch ? `<div class="pitch">${e(range.pitch)}</div>` : ""}${range.context
          ? `<p class="excerpt">${excerptMarkup(range)}</p>`
          : ""}${range.target && !range.context.includes(range.target)
          ? `<p class="help">該当文字：${e(range.target)}</p>`
          : ""}
      </div>`;
    })
    .join("");
  return html`<div class="detail-layout">
    <div class="back-row">
      ${back()}<button
        class="text-button danger-text"
        data-action="delete-song"
        data-id="${song.id}"
      >
        ゴミ箱へ
      </button>
    </div>
    <div class="detail-heading">
      <p class="eyebrow">YOUR REPERTOIRE</p>
      ${badge(categoryOf(state, song.categoryId))}
      <h1>${e(song.title)}</h1>
      <div class="artist tag-row">
        ${tagPills(state, "artists", song.artists) || "アーティスト未設定"}
      </div>
      <div class="actions">
        <button class="button secondary small" data-go="/edit/${song.id}">曲の情報を編集</button
        >${song.lyrics
          ? `<button class="button primary small" data-go="/lyrics/${song.id}">歌詞を大きく読む</button>`
          : ""}
      </div>
    </div>
    ${song.keyNote
      ? `<section class="panel"><p class="eyebrow">KEY MEMO</p><p class="prewrap">${e(song.keyNote)}</p></section>`
      : ""}
    <section class="panel section-purple">
      <h2>曲のプロフィール</h2>
      <dl class="detail-facts">
        <div class="fact">
          <dt>ジャンル</dt>
          <dd>
            <div class="tag-row">${tagPills(state, "genres", song.genres) || "未設定"}</div>
          </dd>
        </div>
        <div class="fact">
          <dt>知名度／流行度</dt>
          <dd>${e(song.popularity || "未設定")}</dd>
        </div>
        <div class="fact">
          <dt>時期（西暦）</dt>
          <dd>${e(song.year || "未設定")}</dd>
        </div>
        <div class="fact">
          <dt>思い出</dt>
          <dd>
            <div class="tag-row">${tagPills(state, "memories", song.memories) || "未設定"}</div>
          </dd>
        </div>
      </dl>
    </section>
    ${rangeHtml
      ? `<section class="panel section-orange"><h2>音域メモ</h2><div class="detail-ranges">${rangeHtml}</div></section>`
      : ""}
    <section class="panel section-green">
      <div class="lyrics-head">
        <h2>歌詞</h2>
        ${song.lyrics ? fontControls() : ""}
      </div>
      ${song.lyrics
        ? `<div class="lyrics-text font-${state.preferences.lyricsFont}">${e(song.lyrics)}</div>`
        : `<p class="muted">歌詞はまだ登録されていません。</p><button class="text-button" data-go="/edit/${song.id}">歌詞を追加する</button>`}
    </section>
    ${song.notes
      ? `<section class="panel section-orange"><h2>その他メモ</h2><p class="prewrap">${e(song.notes)}</p></section>`
      : ""}
    <p class="help">追加：${dateLabel(song.createdAt)} ／ 更新：${dateLabel(song.updatedAt)}</p>
  </div>`;
}
function readerMarkup(song) {
  return html`<div class="lyrics-reader">
    <div class="reader-tools">${back(`/song/${song.id}`, "曲の詳細へ")}${fontControls()}</div>
    <h1>${e(song.title)}</h1>
    ${`<div class="lyrics-text font-${state.preferences.lyricsFont}">${e(song.lyrics || "歌詞が登録されていません。")}</div>`}
    <p class="help">${wakeLock ? "画面の自動ロックを抑制しています" : ""}</p>
  </div>`;
}

function bulkMarkup() {
  return html`<div class="editor-layout">
    <div class="back-row">${back()}</div>
    ${title("ADD YOUR REPERTOIRE", "思いつくまま、まとめて。")}
    <div class="segmented">
      <button data-go="/add">1曲ずつ追加</button
      ><button class="active" data-go="/bulk">まとめて追加</button>
    </div>
    <section class="panel">
      <h2>1行に1曲ずつ</h2>
      <p class="section-description">
        曲名を改行して入力・貼り付けしてください。表計算から「曲名」「アーティスト」の2列をコピーすると、歌手も読み取れます。
      </p>
      <label class="field"
        ><span class="label">曲のリスト</span
        ><textarea
          id="bulk-text"
          rows="9"
          maxlength="300000"
          placeholder="曲名その1&#10;曲名その2&#10;曲名その3"
        >
${e(bulkText)}</textarea
        >
      </label>
      <div class="field-grid">
        <label class="field"
          ><span class="label">共通の歌う分類</span
          ><select id="bulk-category">
            ${options(state.categories, bulkCategory)}
          </select></label
        ><label class="field"
          ><span class="label">共通のジャンルタグ</span
          ><input
            id="bulk-genres"
            value="${e(bulkGenres)}"
            maxlength="1000"
            placeholder="カンマ区切り"
        /></label>
      </div>
      <div class="bulk-tag-area">
        <p class="tag-prompt">共通のジャンルをタップして選ぶ</p>
        <div data-suggestions="genres">
          ${tagSuggestionsMarkup(state, "genres", splitTags(bulkGenres))}
        </div>
      </div>
      <label class="field"
        ><span class="label">共通の思い出タグ</span
        ><input
          id="bulk-memories"
          value="${e(bulkMemories)}"
          maxlength="1000"
          placeholder="カンマ区切り"
      /></label>
      <div class="bulk-tag-area">
        <p class="tag-prompt">共通の思い出をタップして選ぶ</p>
        <div data-suggestions="memories">
          ${tagSuggestionsMarkup(state, "memories", splitTags(bulkMemories))}
        </div>
      </div>
      <button class="button primary full" data-action="bulk-preview">登録前に確認する</button>
      <p class="help">1回に500曲まで。入力中のリストも端末内に下書き保存します。</p>
    </section>
    <div id="bulk-results"></div>
  </div>`;
}
function applyTheme(value) {
  const theme = validateTheme(value);
  const properties = themeProperties(theme);
  for (const [name, color] of Object.entries(properties))
    document.documentElement.style.setProperty(name, color);
  $('meta[name="theme-color"]').content = hexColor(theme.background);
  document.documentElement.style.colorScheme =
    properties["--ink"] === "rgb(255, 255, 255)" ? "dark" : "light";
}
function readThemeInputs() {
  const result = {};
  for (const key of ["background", "accent"])
    result[key] = [0, 1, 2].map((index) => {
      const value = $(`[data-theme-channel="${key}"][data-channel="${index}"]`).value;
      if (!/^\d{1,3}$/.test(value))
        throw new Error("RGBはそれぞれ0〜255の整数で入力してください。");
      return Number(value);
    });
  return validateTheme(result);
}
function previewTheme(node) {
  if (!themeDraft) return;
  if (node.dataset.themePicker) {
    const key = node.dataset.themePicker;
    if (!/^#[0-9a-f]{6}$/i.test(node.value)) return;
    themeDraft[key] = [1, 3, 5].map((start) => parseInt(node.value.slice(start, start + 2), 16));
    themeDraft[key].forEach((value, index) => {
      $(`[data-theme-channel="${key}"][data-channel="${index}"]`).value = value;
    });
  } else {
    try {
      themeDraft = readThemeInputs();
    } catch (error) {
      $("#theme-status").textContent = error.message;
      return;
    }
    for (const key of ["background", "accent"])
      $(`[data-theme-picker="${key}"]`).value = hexColor(themeDraft[key]);
  }
  applyTheme(themeDraft);
  $("#theme-status").textContent = "プレビュー中です。「この配色を保存」で端末に保存します。";
}
function settingsMarkup() {
  themeDraft = clone(state.preferences.theme);
  return renderSettings(state, { offlineReady, rollbackAvailable });
}
function trashMarkup() {
  const songs = state.songs
    .filter((song) => song.deletedAt)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return html`<div class="settings-layout">
    <div class="back-row">${back("/settings", "設定へ")}</div>
    ${title("RECENTLY DELETED", "ゴミ箱", `<span class="count">${songs.length}曲</span>`)}
    <section class="panel">
      <p class="section-description">完全に削除するまでは、いつでも元に戻せます。</p>
      ${songs.length
        ? songs
            .map(
              (song) =>
                html`<div class="trash-item">
                  <h3>${e(song.title)}</h3>
                  <p class="help">${e(song.artists.join(" / "))} · ${dateLabel(song.deletedAt)}</p>
                  <div class="actions">
                    <button
                      class="button secondary small"
                      data-action="restore-song"
                      data-id="${song.id}"
                    >
                      元に戻す</button
                    ><button
                      class="text-button danger-text"
                      data-action="purge-song"
                      data-id="${song.id}"
                    >
                      完全に削除
                    </button>
                  </div>
                </div>`,
            )
            .join("")
        : '<p class="muted">ゴミ箱は空です。</p>'}
    </section>
  </div>`;
}

async function acquireWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {}
}
async function renderRoute(keepScroll = false) {
  stopMarquees();
  clearTimeout(searchTimer);
  tagController.leaveRoute();
  const openSections = keepScroll
    ? [...root.querySelectorAll("details[id][open]")].map((node) => node.id)
    : [];
  const token = ++routeToken;
  const nextRoute = location.hash.slice(1).startsWith("/") ? location.hash.slice(1) : "/";
  if (route === "/" && nextRoute !== "/") listScroll = window.scrollY;
  if (editor && !nextRoute.startsWith("/add") && !nextRoute.startsWith("/edit/")) {
    await flushDraft();
    editor = null;
  }
  route = nextRoute;
  document.body.classList.toggle("list-mode", route === "/");
  applyTheme(state.preferences.theme);
  document.body.classList.toggle("reader-mode", route.startsWith("/lyrics/"));
  if (!route.startsWith("/lyrics/") && wakeLock) {
    await wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  const nav =
    route.startsWith("/settings") || route.startsWith("/tags/") || route === "/trash"
      ? "settings"
      : route === "/add" || route === "/bulk" || route.startsWith("/edit/")
        ? "add"
        : "list";
  document.querySelectorAll("[data-nav]").forEach((node) => {
    if (node.dataset.nav === nav) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
  $("#header-add").hidden = nav === "add";
  if (route === "/") {
    newDraft = await store.get("draft:new");
    if (token !== routeToken) return;
    root.innerHTML = listMarkup();
    updateResults();
    if (!keepScroll) requestAnimationFrame(() => window.scrollTo(0, listScroll));
  } else if (route === "/add" || route.startsWith("/edit/")) {
    const editingId = route.startsWith("/edit/") ? route.split("/")[2] : null;
    if (!editor || (editor.isNew ? editingId !== null : editor.song.id !== editingId)) {
      if (editor) await flushDraft();
      const song = editingId
        ? state.songs.find((item) => item.id === editingId && !item.deletedAt)
        : emptySong();
      if (!song) {
        root.innerHTML = `<div class="empty-state"><h2>曲が見つかりません</h2>${back()}</div>`;
        return;
      }
      const key = editingId ? `draft:${editingId}` : "draft:new";
      const draft = await store.get(key);
      if (token !== routeToken) return;
      editor = draft?.song
        ? { ...draft, isNew: !editingId }
        : {
            song: clone(song),
            isNew: !editingId,
            baseRevision: state.revision,
          };
      editor.pendingTags ??= {};
      if (
        editor.song.categoryId &&
        !state.categories.some((category) => category.id === editor.song.categoryId)
      )
        editor.song.categoryId = "";
      editor.dirty = !!draft;
    }
    root.innerHTML = editorMarkup(state, editor);
  } else if (route === "/bulk") {
    const draft = await store.get("draft:bulk");
    if (token !== routeToken) return;
    if (draft && !bulkText) {
      bulkText = draft.text ?? "";
      bulkCategory = state.categories.some((c) => c.id === draft.category) ? draft.category : "";
      bulkGenres = draft.genres ?? "";
      bulkMemories = draft.memories ?? "";
    }
    root.innerHTML = bulkMarkup();
  } else if (route === "/settings") {
    rollbackAvailable = !!(await store.get("beforeRestore"));
    if (token !== routeToken) return;
    root.innerHTML = settingsMarkup();
  } else if (route.startsWith("/tags/") && Object.hasOwn(TAG_GROUPS, route.split("/")[2])) {
    root.innerHTML = tagController.markup(route.split("/")[2]);
  } else if (route === "/trash") root.innerHTML = trashMarkup();
  else if (route.startsWith("/song/") || route.startsWith("/lyrics/")) {
    const song = state.songs.find((item) => item.id === route.split("/")[2] && !item.deletedAt);
    if (!song)
      root.innerHTML = `<div class="empty-state"><h2>曲が見つかりません</h2>${back()}</div>`;
    else if (route.startsWith("/lyrics/")) {
      await acquireWakeLock();
      if (token !== routeToken) return;
      root.innerHTML = readerMarkup(song);
    } else root.innerHTML = detailMarkup(song);
  } else {
    location.hash = "#/";
    return;
  }
  for (const id of openSections) {
    const section = document.getElementById(id);
    if (section) section.open = true;
  }
  if (!keepScroll && route !== "/") window.scrollTo(0, 0);
  document.title =
    route.startsWith("/song/") || route.startsWith("/lyrics/")
      ? `${state.songs.find((s) => s.id === route.split("/")[2])?.title ?? "楽曲"} | OHAKO`
      : "OHAKO-18番-";
}

async function go(target) {
  if (editor) await flushDraft();
  if (route === "/bulk") await saveBulkDraft();
  if (location.hash === `#${target}`) await renderRoute();
  else location.hash = target;
}
function updateConnection() {
  $("#connection").textContent = navigator.onLine ? "端末に保存" : "オフライン";
  $("#connection").classList.toggle("offline", !navigator.onLine);
}

function captureTagInput(key) {
  if (!editor) return;
  const input = $(`[data-tag-input="${key}"]`);
  if (!input?.value.trim()) return;
  const additions = splitTags(input.value);
  if (
    additions.some((value) => value.length > 150) ||
    uniq([...editor.song[key], ...additions]).length > 100
  )
    throw new Error("タグ・アーティストは各100件まで、1件150文字以内です。");
  editor.song[key] = uniq([...editor.song[key], ...additions]);
  input.value = "";
  editor.pendingTags[key] = "";
  editor.dirty = true;
}
function refreshTagSuggestions(key) {
  const node = $(`[data-suggestions="${key}"]`);
  const current = tagEditorState();
  if (!node || !current) return;
  node.innerHTML = tagSuggestionsMarkup(
    state,
    key,
    current.song[key],
    editor?.pendingTags?.[key] ?? "",
  );
}
function refreshTagEditor(key) {
  const selected = $(`[data-selected="${key}"]`);
  if (selected && editor) selected.innerHTML = selectedTagsMarkup(state, key, editor.song[key]);
  if (route === "/bulk") {
    const input = $(`#bulk-${key}`);
    if (input) input.value = key === "genres" ? bulkGenres : bulkMemories;
  }
  refreshTagSuggestions(key);
}
async function flushDraft() {
  clearTimeout(draftTimer);
  if (!editor?.dirty) return;
  const snapshot = clone({
    song: editor.song,
    isNew: editor.isNew,
    pendingTags: editor.pendingTags,
    baseRevision: editor.baseRevision,
    updatedAt: new Date().toISOString(),
  });
  await store.put(draftKey(editor), snapshot);
  if ($("#draft-status")) $("#draft-status").textContent = "下書きを端末に保存しました";
}
function scheduleDraft() {
  if (!editor) return;
  editor.dirty = true;
  if ($("#draft-status")) $("#draft-status").textContent = "下書きを保存中…";
  clearTimeout(draftTimer);
  draftTimer = setTimeout(
    () =>
      flushDraft().catch((error) => {
        if ($("#draft-status")) $("#draft-status").textContent = "下書きの保存に失敗";
        toast(error.message, true);
      }),
    400,
  );
}
async function saveBulkDraft() {
  await store.put("draft:bulk", {
    text: bulkText,
    category: bulkCategory,
    genres: bulkGenres,
    memories: bulkMemories,
  });
}
async function saveSong() {
  for (const key of ["artists", "genres", "memories"]) captureTagInput(key);
  if (!editor.song.title.trim()) {
    $('[data-song-field="title"]').focus();
    throw new Error("曲名を入力してください。");
  }
  await flushDraft();
  if (editor.baseRevision !== state.revision) {
    if (
      !(await modal({
        title: "別の画面で更新されています",
        message:
          "この曲の入力内容を、現在のデータに反映します。同じ曲をほかの画面で編集していた場合、その変更は今回の入力で置き換わります。",
        confirm: "入力した内容で保存",
      }))
    )
      return;
  }
  const song = clone(editor.song);
  song.title = song.title.trim();
  song.updatedAt = new Date().toISOString();
  if (
    state.songs.some(
      (item) =>
        item.id !== song.id && !item.deletedAt && normalize(item.title) === normalize(song.title),
    )
  ) {
    if (
      !(await modal({
        title: "同じ曲名が登録されています",
        message: "別アーティストや別バージョンであれば、そのまま登録できます。",
        confirm: "この内容で保存",
      }))
    )
      return;
  }
  const key = draftKey(editor);
  clearTimeout(draftTimer);
  await commit(
    (next) => {
      const index = next.songs.findIndex((item) => item.id === song.id);
      if (index < 0) next.songs.push(song);
      else next.songs[index] = song;
    },
    { clearDraft: key },
  );
  editor = null;
  newDraft = null;
  toast("曲を端末に保存しました");
  await go(`/song/${song.id}`);
}

function filterHtml() {
  const values = (key) =>
    uniq(activeSongs(state).flatMap((song) => song[key])).sort((a, b) => a.localeCompare(b, "ja"));
  const chips = (key, label) =>
    html`<p class="filter-heading">${label}</p>
      <label class="field"
        ><span class="sr-only">${label}を検索</span
        ><input
          type="search"
          data-filter-tag-search="${key}"
          placeholder="${label}のタグを探す"
          value="${e(filterTagQueries[key] ?? "")}"
      /></label>
      <div data-filter-tag-results="${key}">
        ${filterTagChoices(
          state,
          key,
          filterWorking[key] ?? [],
          filterTagQueries[key] ?? "",
          filterTagPages[key] ?? 0,
        )}
      </div>`;
  return html`<div class="modal-scroll">
    <p class="help">同じ種類のタグは「どれかに一致」、異なる条件はすべて満たす曲を表示します。</p>
    <label class="field"
      ><span class="label">歌う分類</span
      ><select id="filter-category">
        ${options(
          [...state.categories, { id: "__unset", label: "未設定" }],
          filterWorking.category,
          "すべて",
        )}
      </select></label
    >
    <div class="field-grid">
      <label class="field"
        ><span class="label">知名度／流行度</span
        ><select id="filter-popularity">
          ${options(POPULARITY, filterWorking.popularity, "すべて")}
        </select></label
      ><label class="field"
        ><span class="label">西暦</span
        ><select id="filter-year">
          ${options(values("year").filter(Boolean).sort().reverse(), filterWorking.year, "すべて")}
        </select></label
      >
    </div>
    <label class="field"
      ><span class="label">歌詞</span
      ><select id="filter-lyrics">
        ${options(
          [
            { id: "yes", label: "登録あり" },
            { id: "no", label: "登録なし" },
          ],
          filterWorking.lyrics,
          "どちらも",
        )}
      </select></label
    >${chips("genres", "ジャンル")}${chips("memories", "思い出")}<button
      class="text-button"
      data-action="reset-modal-filters"
    >
      条件をリセット
    </button>
  </div>`;
}
async function openFilters() {
  filterWorking = clone(filters);
  filterTagQueries = {};
  filterTagPages = {};
  const confirmed = await modal({
    title: "曲を絞り込む",
    html: filterHtml(),
    confirm: "この条件で表示",
  });
  if (!confirmed) return;
  for (const key of ["category", "popularity", "year", "lyrics"])
    filterWorking[key] = $(`#filter-${key}`).value;
  filters = clone(filterWorking);
  listPage = 0;
  await renderRoute(true);
}

function filename(extension) {
  const time = new Date(),
    pad = (value) => String(value).padStart(2, "0");
  return `ohako-${time.getFullYear()}${pad(time.getMonth() + 1)}${pad(time.getDate())}-${pad(time.getHours())}${pad(time.getMinutes())}${pad(time.getSeconds())}.${extension}`;
}
async function exportFile(kind) {
  const json = kind === "json";
  const contents = json ? makeBackup(state) : makeCsv(state, $("#csv-lyrics")?.checked ?? true);
  const file = new File([contents], filename(json ? "ohako.json" : "csv"), {
    type: json ? "application/json" : "text/csv;charset=utf-8",
  });
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: json ? "OHAKO バックアップ" : "OHAKO 楽曲一覧",
      });
      shared = true;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  if (!shared) {
    const url = URL.createObjectURL(file),
      link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  if (json) {
    const exportedRevision = state.revision;
    state = await store.markExported(exportedRevision);
    await renderRoute(true);
  }
  toast("書き出しました。「ファイル」やダウンロード先で保存できたことを確認してください。");
}
async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) throw new Error("ファイルが大きすぎます（上限25MB）。");
  const backup = readBackup(await file.text());
  const count = activeSongs(backup.data).length;
  if (
    !(await modal({
      title: "バックアップから復元しますか？",
      message: `書き出し：${dateLabel(backup.exportedAt)}\n楽曲：${count}曲\nゴミ箱：${backup.data.songs.length - count}曲\n分類：${backup.data.categories.length}件\n\n現在の全楽曲と設定を置き換えます。現在の内容は、直前の復元を取り消すために端末内に退避します。`,
      confirm: "この内容に置き換える",
    }))
  )
    return;
  const next = clone(backup.data);
  next.lastExportRevision = -1;
  try {
    state = await store.save(next, state.revision, {
      snapshot: true,
      clearDraft: "*",
    });
  } catch (error) {
    if (error instanceof ConflictError) state = await store.load();
    throw error;
  }
  editor = null;
  newDraft = null;
  bulkText = "";
  bulkRows = [];
  query = "";
  filters = {};
  tagController.reset();
  channel?.postMessage("changed");
  await renderRoute(true);
  toast(`${count}曲と設定を復元しました`);
}

async function handleAction(action, node) {
  if (await tagController.handleAction(action, node)) return;
  const songId = node.dataset.id;
  switch (action) {
    case "add":
      await go("/add");
      break;
    case "settings-section":
      document
        .getElementById(node.dataset.value)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    case "clear-search":
      clearTimeout(searchTimer);
      listPage = 0;
      query = "";
      $("#song-search").value = "";
      $(".search-clear").hidden = true;
      updateResults();
      $("#song-search").focus();
      break;
    case "clear-filters":
      listPage = 0;
      query = "";
      filters = {};
      await renderRoute(true);
      break;
    case "category-filter":
      listPage = 0;
      filters.category = node.dataset.value;
      await renderRoute(true);
      break;
    case "list-page":
      listPage = Number(node.dataset.page);
      updateResults();
      window.scrollTo(0, 0);
      break;
    case "list-legend":
      await modal({
        title: "一覧のアイコンの見方",
        html: `<div class="legend-list">${state.categories.map((category) => html`<div>${categoryMarker(category)}<span>${e(category.label)}</span></div>`).join("")}</div><p>＃の数字はジャンル・思い出タグの合計数です。紙のアイコンは歌詞がある曲です。曲を開くと詳しい情報を確認できます。</p><p>分類のアイコンと色は設定から変更できます。</p>`,
        confirm: "わかりました",
        cancel: "閉じる",
      });
      break;
    case "category-appearance": {
      const category = categoryOf(state, songId);
      appearanceDraft = { icon: category.icon, color: category.color };
      if (
        await modal({
          title: `「${category.label}」の目印`,
          html: `<p class="filter-heading">アイコン</p><div class="appearance-icons">${Object.entries(
            ICON_LABELS,
          )
            .map(
              ([value, label]) =>
                `<button class="appearance-choice${value === category.icon ? " selected" : ""}" data-action="appearance-icon" data-value="${value}" aria-label="${label}" aria-pressed="${value === category.icon}">${categoryIcon(value)}<small>${label}</small></button>`,
            )
            .join("")}</div><p class="filter-heading">色</p><div class="filter-options">${[
            ["blue", "水色"],
            ["gray", "グレー"],
            ["green", "緑"],
            ["purple", "紫"],
            ["pink", "ピンク"],
            ["orange", "オレンジ"],
          ]
            .map(
              ([value, label]) =>
                `<button class="appearance-color color-${value}${value === category.color ? " selected" : ""}" data-action="appearance-color" data-value="${value}" aria-pressed="${value === category.color}">${label}</button>`,
            )
            .join("")}</div>`,
          confirm: "目印を保存",
        })
      ) {
        await commit((next) =>
          Object.assign(
            next.categories.find((category) => category.id === songId),
            appearanceDraft,
          ),
        );
        await renderRoute(true);
        toast("分類のアイコンと色を保存しました");
      }
      break;
    }
    case "capacity": {
      const bytes = new Blob([makeBackup(state)]).size,
        estimate = await navigator.storage?.estimate?.();
      const mb = (value) => (value / 1024 / 1024).toFixed(1) + " MB";
      await modal({
        title: "データ容量",
        message: `登録・ゴミ箱：${state.songs.length.toLocaleString()} / 10,000曲\nJSONバックアップ：約${mb(bytes)}\nJSON読み込みの上限：25 MB\n${estimate?.usage !== undefined ? `このサイトの端末内使用量：約${mb(estimate.usage)}\n` : ""}\n曲数だけでなく、歌詞やメモの長さで容量は変わります。端末内の使用量には下書き・復元前のコピー・アプリ本体も含まれます。${bytes > MAX_FILE_SIZE ? "\n\n注意：現在のJSONは25 MBを超えるため、この版ではそのまま復元できません。データの分割などの対応が必要です。" : ""}`,
        confirm: "閉じる",
        cancel: "戻る",
      });
      break;
    }
    case "filters":
      await openFilters();
      break;
    case "add-tag":
      captureTagInput(node.dataset.key);
      refreshTagEditor(node.dataset.key);
      scheduleDraft();
      $(`[data-tag-input="${node.dataset.key}"]`)?.focus();
      break;
    case "remove-tag":
      editor.song[node.dataset.key].splice(Number(node.dataset.index), 1);
      refreshTagEditor(node.dataset.key);
      scheduleDraft();
      break;
    case "select-range": {
      const key = node.dataset.key,
        input = $(`#context-${key}`),
        range = editor.song.ranges[key];
      if (input.selectionStart === input.selectionEnd)
        throw new Error("先に「付近の歌詞」の中で、記録したい文字を選択してください。");
      range.start = input.selectionStart;
      range.target = input.value.slice(input.selectionStart, input.selectionEnd);
      $(`#target-${key}`).value = range.target;
      scheduleDraft();
      toast("該当する文字を記録しました");
      break;
    }
    case "discard-editor": {
      if (
        !(await modal({
          title: "入力中の内容を破棄しますか？",
          message: editor.isNew
            ? "この下書きを削除します。"
            : "保存済みの曲は変更せず、今回の編集内容を破棄します。",
          confirm: "破棄する",
          danger: true,
        }))
      )
        break;
      clearTimeout(draftTimer);
      await store.put(draftKey(editor), undefined);
      const target = editor.isNew ? "/" : `/song/${editor.song.id}`;
      editor = null;
      await go(target);
      break;
    }
    case "discard-new-draft":
      if (
        await modal({
          title: "下書きを削除しますか？",
          confirm: "削除する",
          danger: true,
        })
      ) {
        await store.put("draft:new", undefined);
        newDraft = null;
        await renderRoute(true);
      }
      break;
    case "delete-song": {
      const song = state.songs.find((item) => item.id === songId);
      if (
        await modal({
          title: "この曲をゴミ箱に移しますか？",
          message: song.title,
          confirm: "ゴミ箱へ移す",
        })
      ) {
        await commit(
          (next) => {
            next.songs.find((item) => item.id === songId).deletedAt = new Date().toISOString();
          },
          { clearDraft: `draft:${songId}` },
        );
        await go("/");
        toast("ゴミ箱に移しました。設定から元に戻せます。");
      }
      break;
    }
    case "restore-song":
      await commit((next) => {
        const song = next.songs.find((item) => item.id === songId);
        song.deletedAt = null;
        song.updatedAt = new Date().toISOString();
      });
      await renderRoute(true);
      toast("曲を一覧に戻しました");
      break;
    case "purge-song":
      if (
        await modal({
          title: "完全に削除しますか？",
          message: "この端末のゴミ箱から削除します。この操作は取り消せません。",
          confirm: "完全に削除",
          danger: true,
        })
      ) {
        await commit(
          (next) => {
            next.songs = next.songs.filter((song) => song.id !== songId);
          },
          { clearDraft: `draft:${songId}` },
        );
        await renderRoute(true);
        toast("完全に削除しました");
      }
      break;
    case "font": {
      const sizes = [16, 18, 20, 24, 28],
        current = sizes.indexOf(state.preferences.lyricsFont);
      const next = sizes[Math.max(0, Math.min(4, current + Number(node.dataset.direction)))];
      if (next !== state.preferences.lyricsFont) {
        await commit((state) => {
          state.preferences.lyricsFont = next;
        });
        await renderRoute(true);
      }
      break;
    }
    case "samples": {
      if (
        !(await modal({
          title: "架空のサンプルを追加しますか？",
          message:
            "使い方を試すためのオリジナル曲3件を追加します。不要になったらゴミ箱へ移せます。既存の曲はそのまま残ります。",
          confirm: "サンプルを追加",
        }))
      )
        break;
      const additions = samples().filter(
        (song) =>
          !activeSongs(state).some(
            (existing) => existing.title === song.title && existing.notes === song.notes,
          ),
      );
      await commit((next) => {
        for (const song of additions) {
          if (!next.categories.some((category) => category.id === song.categoryId))
            song.categoryId = "";
          next.songs.push(song);
        }
      });
      await go("/");
      toast(additions.length ? "サンプル3曲を追加しました" : "サンプルはすでに登録されています");
      break;
    }
    case "bulk-preview": {
      await saveBulkDraft();
      bulkRows = parseBulk(bulkText);
      if (!bulkRows.length) throw new Error("曲名を1行に1曲ずつ入力してください。");
      if (bulkRows.length > 500) throw new Error("1回に登録できるのは500曲までです。");
      if (
        bulkRows.some(
          (song) =>
            !song.title ||
            song.title.length > 500 ||
            song.artists.length > 100 ||
            song.artists.some((artist) => artist.length > 150),
        )
      )
        throw new Error(
          "空の曲名、長すぎる曲名・歌手名、または100件を超える歌手が含まれています。",
        );
      const titles = new Set(activeSongs(state).map((song) => normalize(song.title)));
      let duplicates = 0;
      for (const song of bulkRows) {
        if (titles.has(normalize(song.title))) duplicates++;
        titles.add(normalize(song.title));
      }
      $("#bulk-results").innerHTML =
        `<section class="panel"><h2>${bulkRows.length}曲を登録します</h2>${duplicates ? `<p class="warning">同じ曲名が${duplicates}件あります。別バージョンなどの場合は、そのまま登録できます。</p>` : ""}<div class="bulk-preview">${bulkRows.map((song) => html`<div class="bulk-item">${e(song.title)}${song.artists.length ? `<small>${e(song.artists.join(" / "))}</small>` : ""}</div>`).join("")}</div><button class="button primary full" data-action="bulk-save">この${bulkRows.length}曲を登録する</button></section>`;
      $("#bulk-results").scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    }
    case "bulk-save": {
      if (!bulkRows.length) throw new Error("もう一度、登録前の確認をしてください。");
      const genres = splitTags(bulkGenres),
        memories = splitTags(bulkMemories);
      const additions = bulkRows.map((item) => ({
        ...emptySong(),
        title: item.title,
        artists: item.artists,
        categoryId: bulkCategory,
        genres: [...genres],
        memories: [...memories],
      }));
      await commit(
        (next) => {
          next.songs.push(...additions);
        },
        { clearDraft: "draft:bulk" },
      );
      bulkText = "";
      bulkRows = [];
      bulkCategory = "";
      bulkGenres = "";
      bulkMemories = "";
      await go("/");
      toast(`${additions.length}曲を端末に登録しました`);
      break;
    }
    case "export-json":
      await exportFile("json");
      break;
    case "save-theme": {
      const value = readThemeInputs();
      await commit((next) => {
        next.preferences.theme = value;
      });
      applyTheme(value);
      $("#theme-status").textContent =
        "この配色を端末に保存しました。JSONバックアップにも含まれます。";
      toast("テーマカラーを保存しました");
      break;
    }
    case "reset-theme": {
      await commit((next) => {
        next.preferences.theme = clone(DEFAULT_THEME);
      });
      themeDraft = clone(DEFAULT_THEME);
      applyTheme(themeDraft);
      $("#theme-editor").innerHTML = themeEditorMarkup(themeDraft);
      $("#theme-status").textContent = "冬のグレーと水色に戻して保存しました。";
      toast("冬の配色に戻しました");
      break;
    }
    case "export-csv":
      await exportFile("csv");
      break;
    case "choose-import":
      $("#import-file").click();
      break;
    case "undo-restore": {
      const previous = await store.get("beforeRestore");
      if (!previous) break;
      if (
        !(await modal({
          title: "復元前の内容に戻しますか？",
          message:
            "復元後に追加・編集した内容も置き換わります。必要なら先にJSONを書き出してください。",
          confirm: "復元前に戻す",
        }))
      )
        break;
      const next = validateState(previous);
      next.lastExportRevision = -1;
      state = await store.save(next, state.revision, { clearDraft: "*" });
      await store.put("beforeRestore", undefined);
      bulkText = "";
      query = "";
      filters = {};
      tagController.reset();
      channel?.postMessage("changed");
      await renderRoute(true);
      toast("復元前の内容に戻しました");
      break;
    }
    case "new-category": {
      const label = $("#new-category").value.trim();
      if (!label) throw new Error("分類名を入力してください。");
      await commit((next) => {
        next.categories.push({
          id: id(),
          label,
          color: COLORS[next.categories.length % COLORS.length],
          icon: "note",
        });
      });
      await renderRoute(true);
      toast("分類を追加しました");
      break;
    }
    case "rename-category": {
      const label = $(`#category-${songId}`).value.trim();
      if (!label) throw new Error("分類名を入力してください。");
      await commit((next) => {
        next.categories.find((category) => category.id === songId).label = label;
      });
      await renderRoute(true);
      toast("分類名を保存しました");
      break;
    }
    case "move-category":
      await commit((next) => {
        const from = next.categories.findIndex((category) => category.id === songId),
          to = from + Number(node.dataset.direction);
        if (to >= 0 && to < next.categories.length)
          [next.categories[from], next.categories[to]] = [
            next.categories[to],
            next.categories[from],
          ];
      });
      await renderRoute(true);
      break;
    case "delete-category": {
      const category = categoryOf(state, songId),
        count = state.songs.filter((song) => song.categoryId === songId).length;
      if (
        !(await modal({
          title: `「${category.label}」を削除しますか？`,
          message: count
            ? `ゴミ箱を含む${count}曲で使用しています。曲の移動先を選んでください。`
            : "楽曲データは削除されません。",
          html: count
            ? `<label class="field"><span class="label">移動先</span><select id="replacement-category">${options(
                state.categories.filter((category) => category.id !== songId),
                "",
              )}</select></label>`
            : "",
          confirm: "分類を削除",
          danger: true,
        }))
      )
        break;
      const replacement = $("#replacement-category")?.value ?? "";
      await commit((next) => {
        next.categories = next.categories.filter((category) => category.id !== songId);
        next.songs.forEach((song) => {
          if (song.categoryId === songId) song.categoryId = replacement;
        });
      });
      if (filters.category === songId) filters.category = replacement;
      await renderRoute(true);
      toast("分類を削除しました");
      break;
    }
    case "persist": {
      if (!navigator.storage?.persist)
        throw new Error(
          "このブラウザでは保持設定を変更できません。JSONのバックアップをご利用ください。",
        );
      const granted = await navigator.storage.persist();
      toast(
        granted
          ? "端末内データの保持が許可されました。JSONのバックアップも続けてください。"
          : "保持の許可はブラウザが判断します。データはそのままです。JSONも保存してください。",
      );
      break;
    }
    case "update-app": {
      if (editor) await flushDraft();
      if (route === "/bulk") await saveBulkDraft();
      if (registration?.waiting) {
        updateRequested = true;
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        await registration?.update();
        toast("更新を確認しました");
      }
      break;
    }
  }
}

async function onClick(event) {
  const node = event.target.closest("button,a");
  if (!node) return;
  if (node.getAttribute("href") === "#content") {
    event.preventDefault();
    root.focus();
    return;
  }
  if (node.dataset.modal) return;
  if (busy && !$("#modal").open) return;
  try {
    if (tagController.handleTransient(node.dataset.action, node)) {
      event.preventDefault();
      return;
    }
  } catch (error) {
    toast(error.message, true);
    return;
  }
  if (node.dataset.action === "appearance-icon" || node.dataset.action === "appearance-color") {
    const key = node.dataset.action === "appearance-icon" ? "icon" : "color";
    appearanceDraft[key] = node.dataset.value;
    document.querySelectorAll(`[data-action="${node.dataset.action}"]`).forEach((button) => {
      const selected = button === node;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    return;
  }
  if (node.dataset.action === "toggle-filter-tag") {
    const key = node.dataset.key,
      value = node.dataset.value,
      current = filterWorking[key] ?? [];
    filterWorking[key] = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    $(`[data-filter-tag-results="${key}"]`).innerHTML = filterTagChoices(
      state,
      key,
      filterWorking[key],
      filterTagQueries[key] ?? "",
      filterTagPages[key] ?? 0,
    );
    const selected = filterWorking[key].includes(value);
    node.classList.toggle("selected", selected);
    node.setAttribute("aria-pressed", String(selected));
    return;
  }
  if (node.dataset.action === "filter-tags-page") {
    const key = node.dataset.key;
    filterTagPages[key] = Number(node.dataset.page);
    $(`[data-filter-tag-results="${key}"]`).innerHTML = filterTagChoices(
      state,
      key,
      filterWorking[key] ?? [],
      filterTagQueries[key] ?? "",
      filterTagPages[key],
    );
    return;
  }
  if (node.dataset.action === "reset-modal-filters") {
    filterWorking = {};
    filterTagQueries = {};
    filterTagPages = {};
    $("#modal-content .modal-body").innerHTML = filterHtml();
    return;
  }
  const target =
    node.dataset.go ??
    (node.getAttribute("href")?.startsWith("#/") ? node.getAttribute("href").slice(1) : null);
  if (!target && !node.dataset.action) return;
  event.preventDefault();
  if (busy) return;
  busy = true;
  try {
    if (target) await go(target);
    else await handleAction(node.dataset.action, node);
  } catch (error) {
    toast(error.message || "操作を完了できませんでした。", true);
  } finally {
    busy = false;
  }
}

function onInput(event) {
  const node = event.target;
  if (tagController.handleInput(node)) return;
  if (node.dataset.filterTagSearch) {
    const key = node.dataset.filterTagSearch;
    filterTagQueries[key] = node.value;
    filterTagPages[key] = 0;
    $(`[data-filter-tag-results="${key}"]`).innerHTML = filterTagChoices(
      state,
      key,
      filterWorking[key] ?? [],
      node.value,
    );
    return;
  }
  if (node.dataset.themePicker || node.dataset.themeChannel) {
    previewTheme(node);
    return;
  }
  if (node.id === "song-search") {
    query = node.value;
    listPage = 0;
    $(".search-clear").hidden = !query;
    clearTimeout(searchTimer);
    if (!event.isComposing) searchTimer = setTimeout(updateResults, 100);
    return;
  }
  if (node.dataset.songField && editor) {
    editor.song[node.dataset.songField] = node.value;
    scheduleDraft();
  }
  if (node.dataset.range && editor) {
    const range = editor.song.ranges[node.dataset.range];
    range[node.dataset.rangeField] = node.value;
    if (node.dataset.rangeField === "context" || node.dataset.rangeField === "target")
      range.start = range.context.indexOf(range.target);
    scheduleDraft();
  }
  if (node.dataset.tagInput && editor) {
    editor.pendingTags[node.dataset.tagInput] = node.value;
    refreshTagSuggestions(node.dataset.tagInput);
    scheduleDraft();
  }
  if (node.id.startsWith("bulk-")) {
    if (node.id === "bulk-text") bulkText = node.value;
    if (node.id === "bulk-category") bulkCategory = node.value;
    if (node.id === "bulk-genres") bulkGenres = node.value;
    if (node.id === "bulk-memories") bulkMemories = node.value;
    if (node.id === "bulk-genres" || node.id === "bulk-memories")
      refreshTagSuggestions(node.id.slice(5));
    bulkRows = [];
    if ($("#bulk-results")) $("#bulk-results").innerHTML = "";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(
      () => saveBulkDraft().catch((error) => toast(error.message, true)),
      400,
    );
  }
}

let updateRequested = false;
async function prepareOffline() {
  if (!("serviceWorker" in navigator)) return;
  registration = await navigator.serviceWorker.register("./sw.js", {
    scope: "./",
    updateViaCache: "none",
  });
  const showUpdate = () => {
    $("#update-banner").hidden = !navigator.serviceWorker.controller || !registration.waiting;
  };
  showUpdate();
  registration.addEventListener("updatefound", () => {
    registration.installing?.addEventListener("statechange", showUpdate);
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested) location.reload();
    else showUpdate();
  });
  await navigator.serviceWorker.ready;
  offlineReady = true;
  if ($("#offline-status"))
    $("#offline-status").textContent = "準備できています。機内モードでも試せます。";
}

try {
  store = await openStorage();
  state = await store.load();
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("compositionend", (event) => {
    if (event.target.id === "song-search") {
      query = event.target.value;
      listPage = 0;
      clearTimeout(searchTimer);
      updateResults();
    }
  });
  document.addEventListener("change", async (event) => {
    try {
      if (event.target.id === "sort") {
        sort = event.target.value;
        listPage = 0;
        updateResults();
      }
      if (event.target.id === "list-page") {
        listPage = Number(event.target.value);
        updateResults();
        window.scrollTo(0, 0);
      }
      if (event.target.id === "show-artists" || event.target.id === "animate-titles") {
        const key = event.target.id === "show-artists" ? "showArtists" : "animateTitles";
        const value = event.target.checked;
        await commit((next) => {
          next.preferences[key] = value;
        });
        toast("一覧の表示設定を保存しました");
      }
      if (event.target.id === "lyrics-size") {
        await commit((next) => {
          next.preferences.lyricsFont = Number(event.target.value);
        });
        toast("文字サイズを保存しました");
      }
      if (event.target.id === "import-file") {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!busy) {
          busy = true;
          try {
            await importFile(file);
          } finally {
            busy = false;
          }
        }
      }
    } catch (error) {
      toast(error.message, true);
    }
  });
  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "song-editor") return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await saveSong();
    } catch (error) {
      const box = $("#editor-error");
      if (box) {
        box.textContent = error.message;
        box.hidden = false;
        box.scrollIntoView({ block: "center" });
      } else toast(error.message, true);
    } finally {
      busy = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.dataset.tagInput && !event.isComposing) {
      event.preventDefault();
      try {
        captureTagInput(event.target.dataset.tagInput);
        refreshTagEditor(event.target.dataset.tagInput);
        scheduleDraft();
      } catch (error) {
        toast(error.message, true);
      }
    }
  });
  window.addEventListener("hashchange", () =>
    renderRoute().catch((error) => toast(error.message, true)),
  );
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (editor) flushDraft().catch(() => {});
      if (route === "/bulk") saveBulkDraft().catch(() => {});
    } else {
      refreshFromStorage().catch((error) => toast(error.message, true));
      if (route.startsWith("/lyrics/")) acquireWakeLock();
    }
  });
  updateConnection();
  await renderRoute();
  prepareOffline().catch(() => {
    if ($("#offline-status"))
      $("#offline-status").textContent =
        "オフラインの準備に失敗しました。通信できる場所で開き直してください。";
  });
} catch (error) {
  root.innerHTML = `<div class="panel"><h1>楽曲ノートを開けませんでした</h1><p class="error-box">${e(error.message)}</p><p class="help">データを自動で消去することはありません。別のOHAKOを閉じ、ブラウザの通常モードで開き直してください。</p><button class="button secondary" id="retry">もう一度開く</button></div>`;
  $("#retry").addEventListener("click", () => location.reload());
}
