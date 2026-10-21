import { e } from "./model.mjs";
import { TAG_GROUPS, TAG_COLORS, tagIndex, findTags } from "./tag-model.mjs";
import { back, title, html } from "./ui.mjs";

const indexes = new WeakMap();
// Committed state objects are replaced, never mutated, so counts can be reused while typing.
export function indexedTags(state) {
  if (!indexes.has(state)) indexes.set(state, tagIndex(state));
  return indexes.get(state);
}
const colorOf = (state, key, name) =>
  indexedTags(state)[key].get(name)?.color ?? TAG_GROUPS[key].color;
export function tagPills(state, key, values) {
  return values
    .map(
      (name) =>
        `<span class="tag-pill color-${colorOf(state, key, name)}"><span aria-hidden="true">${TAG_GROUPS[key].symbol}</span>${e(name)}</span>`,
    )
    .join("");
}
export function selectedTagsMarkup(state, key, values) {
  return values
    .map(
      (name, index) =>
        `<span class="token color-${colorOf(state, key, name)}">${e(name)}<button type="button" data-action="remove-tag" data-key="${key}" data-index="${index}" aria-label="${e(name)}を外す">×</button></span>`,
    )
    .join("");
}
function choice(tag, key, selected) {
  const checked = selected.includes(tag.name);
  return html`<button
    type="button"
    class="tag-choice color-${tag.color}${checked ? " selected" : ""}"
    data-action="select-tag"
    data-key="${key}"
    data-value="${e(tag.name)}"
    aria-pressed="${checked}"
  >
    <span class="choice-mark" aria-hidden="true">${checked ? "✓" : "＋"}</span>${e(tag.name)}
  </button>`;
}
export function tagSuggestionsMarkup(state, key, selected, query = "") {
  const result = findTags(indexedTags(state), key, query);
  return html`<div class="tag-options">
      ${result.tags.map((tag) => choice(tag, key, selected)).join("")}
    </div>
    ${!result.total
      ? `<p class="help">${query ? "見つからない名前は「追加」で作れます。" : "まだタグがありません。下の欄から作れます。"}</p>`
      : ""}${indexedTags(state)[key].size
      ? `<button type="button" class="tag-browse" data-action="browse-tags" data-key="${key}">すべてから選ぶ（${indexedTags(state)[key].size}）<span aria-hidden="true">›</span></button>`
      : ""}`;
}
export function tagEditorMarkup(state, editor, key, label, placeholder) {
  const value = editor.pendingTags?.[key] ?? "";
  return html`<div class="field tag-field">
    <div class="label">${e(label)}<span class="optional">複数選べます</span></div>
    <div class="selected-tags" data-selected="${key}" aria-label="選択中の${e(label)}">
      ${selectedTagsMarkup(state, key, editor.song[key])}
    </div>
    <p class="tag-prompt">タップして選ぶ</p>
    <div data-suggestions="${key}">
      ${tagSuggestionsMarkup(state, key, editor.song[key], value)}
    </div>
    <div class="tag-create">
      <label class="sr-only" for="tag-${key}">${e(label)}を探す・新しく作る</label
      ><input
        id="tag-${key}"
        data-tag-input="${key}"
        value="${e(value)}"
        maxlength="150"
        placeholder="${e(placeholder)}"
        autocomplete="off"
      /><button
        type="button"
        class="button secondary small tag-add"
        data-action="add-tag"
        data-key="${key}"
      >
        ＋ 追加
      </button>
    </div>
  </div>`;
}
export function tagPickerBody(state, key, selected, query = "", page = 0) {
  const result = findTags(indexedTags(state), key, query, {
    limit: 40,
    offset: page * 40,
  });
  return html`<p class="help" role="status">${result.total}件・複数選べます</p>
    <div class="tag-options picker-options">
      ${result.tags.map((tag) => choice(tag, key, selected)).join("")}
    </div>
    ${!result.total ? '<p class="help">一致するタグがありません。</p>' : ""}${result.total > 40
      ? `<div class="pagination"><button type="button" class="button secondary small" data-action="picker-page" data-page="${page - 1}"${page === 0 ? " disabled" : ""}>前へ</button><span>${page + 1} / ${Math.ceil(result.total / 40)}</span><button type="button" class="button secondary small" data-action="picker-page" data-page="${page + 1}"${(page + 1) * 40 >= result.total ? " disabled" : ""}>次へ</button></div>`
      : ""}`;
}
export function colorChoices(color, action = "tag-color-choice") {
  return html`<div class="color-choices">
    ${Object.entries(TAG_COLORS)
      .map(
        ([value, label]) =>
          `<button type="button" class="color-choice color-${value}${value === color ? " selected" : ""}" data-action="${action}" data-value="${value}" aria-pressed="${value === color}"><span aria-hidden="true">●</span>${label}<span class="choice-mark" aria-hidden="true">${value === color ? "✓" : ""}</span></button>`,
      )
      .join("")}
  </div>`;
}
export function tagManagerResults(state, key, query, page) {
  const result = findTags(indexedTags(state), key, query, {
    limit: 40,
    offset: page * 40,
  });
  return html`<p class="help" role="status">${result.total}件のタグ</p>
    <div class="managed-tags">
      ${result.tags
        .map(
          (tag) =>
            html`<div class="managed-tag">
              <div class="managed-name">
                <span class="tag-pill color-${tag.color}">${e(tag.name)}</span
                ><small
                  >${tag.count}曲${tag.total !== tag.count
                    ? `・ゴミ箱 ${tag.total - tag.count}曲`
                    : ""}</small
                >
              </div>
              <div class="managed-actions">
                <button
                  class="button secondary small"
                  data-action="tag-color"
                  data-key="${key}"
                  data-value="${e(tag.name)}"
                  aria-label="${e(tag.name)}の色を変更"
                >
                  色</button
                ><button
                  class="button danger-outline small"
                  data-action="delete-catalog-tag"
                  data-key="${key}"
                  data-value="${e(tag.name)}"
                  aria-label="${e(tag.name)}のタグを削除"
                >
                  削除
                </button>
              </div>
            </div>`,
        )
        .join("")}
    </div>
    ${!result.total
      ? '<div class="small-empty">タグが見つかりません。<br>下から新しく作れます。</div>'
      : ""}${result.total > 40
      ? `<div class="pagination"><button class="button secondary small" data-action="tag-manager-page" data-page="${page - 1}"${page === 0 ? " disabled" : ""}>前へ</button><span>${page + 1} / ${Math.ceil(result.total / 40)}</span><button class="button secondary small" data-action="tag-manager-page" data-page="${page + 1}"${(page + 1) * 40 >= result.total ? " disabled" : ""}>次へ</button></div>`
      : ""}`;
}
export function tagManagerMarkup(state, key, query = "", page = 0, removal = null) {
  const group = TAG_GROUPS[key];
  return html`<div class="settings-layout">
    <div class="back-row">${back("/settings", "設定へ")}</div>
    ${title("タグを整理する", `${group.label}のタグ`)}
    <div class="segmented tag-tabs">
      ${Object.entries(TAG_GROUPS)
        .map(
          ([value, item]) =>
            `<button class="${value === key ? "active" : ""}" data-go="/tags/${value}"${value === key ? ' aria-current="page"' : ""}>${item.symbol} ${item.label}</button>`,
        )
        .join("")}
    </div>
    ${removal?.key === key
      ? `<div class="undo-banner"><p>「${e(removal.definition.name)}」を削除しました</p><button class="button secondary small" data-action="undo-tag-delete">元に戻す</button></div>`
      : ""}
    <section class="panel section-${group.color}">
      <div class="panel-title">
        <span class="step" aria-hidden="true">${group.symbol}</span>
        <h2>タグを探す・整理する</h2>
      </div>
      <p class="section-description">色を変えると、登録・詳細・絞り込みにも反映されます。</p>
      <label class="search-box"
        ><span class="sr-only">タグを検索</span
        ><input
          id="tag-manager-search"
          type="search"
          value="${e(query)}"
          placeholder="タグ名で検索"
          autocomplete="off"
      /></label>
      <div id="tag-manager-results">${tagManagerResults(state, key, query, page)}</div>
    </section>
    <section class="panel section-green">
      <div class="panel-title">
        <span class="step" aria-hidden="true">＋</span>
        <h2>新しいタグを作る</h2>
      </div>
      <p class="help">曲に付ける前に、タグだけ作っておけます。</p>
      <label class="field"
        ><span class="label">タグ名</span
        ><input
          id="new-tag-name"
          maxlength="150"
          placeholder="例：${key === "genres"
            ? "ゲーム音楽"
            : key === "memories"
              ? "学生時代"
              : "アーティスト名"}" /></label
      ><button class="button success full" data-action="create-catalog-tag" data-key="${key}">
        ＋ タグを作る
      </button>
    </section>
    <p class="help">
      タグの削除は、保存済みの曲とゴミ箱の曲からその目印を外します。曲自体は削除されません。下書きは変更しません。
    </p>
  </div>`;
}

export function filterTagChoices(state, key, selected, query = "", page = 0) {
  const index = indexedTags(state);
  const result = findTags(index, key, query, { limit: 40, offset: page * 40 });
  return html`<p class="help">${result.total}件・選択中 ${selected.length}件</p>
    <div class="filter-options">
      ${result.tags
        .map(
          (tag) =>
            html`<button
              class="filter-tag color-${tag.color}${selected.includes(tag.name) ? " selected" : ""}"
              data-action="toggle-filter-tag"
              data-key="${key}"
              data-value="${e(tag.name)}"
              aria-pressed="${selected.includes(tag.name)}"
            >
              ${e(tag.name)}
            </button>`,
        )
        .join("")}
    </div>
    ${result.total > 40
      ? `<div class="pagination"><button class="button secondary small" data-action="filter-tags-page" data-key="${key}" data-page="${page - 1}"${page === 0 ? " disabled" : ""}>前へ</button><span>${page + 1} / ${Math.ceil(result.total / 40)}</span><button class="button secondary small" data-action="filter-tags-page" data-key="${key}" data-page="${page + 1}"${(page + 1) * 40 >= result.total ? " disabled" : ""}>次へ</button></div>`
      : ""}`;
}
