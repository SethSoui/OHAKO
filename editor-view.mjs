import { e, POPULARITY, RANGE_FIELDS } from "./model.mjs";
import { back, title, options, html } from "./ui.mjs";
import { tagEditorMarkup } from "./tag-view.mjs";

export function editorMarkup(state, editor) {
  function tagEditor(key, label, placeholder) {
    return tagEditorMarkup(state, editor, key, label, placeholder);
  }
  function inputField(
    key,
    label,
    placeholder = "",
    { max = 500, type = "text", required = false } = {},
  ) {
    return html`<label class="field"
      ><span class="label">${label}${required ? '<span class="required">必須</span>' : ""}</span
      ><input
        name="${key}"
        data-song-field="${key}"
        type="${type}"
        value="${e(editor.song[key])}"
        placeholder="${e(placeholder)}"
        maxlength="${max}"
        ${required ? " required" : ""}${key === "year"
          ? ' inputmode="numeric" pattern="[0-9]{4}"'
          : ""}
    /></label>`;
  }
  function textField(key, label, placeholder, max, css = "") {
    return html`<label class="field"
      ><span class="label">${label}</span
      ><textarea
        name="${key}"
        data-song-field="${key}"
        maxlength="${max}"
        placeholder="${e(placeholder)}"
        class="${css}"
      >
${e(editor.song[key])}</textarea
      >
    </label>`;
  }
  function renderEditor() {
    const song = editor.song;
    return html`<div class="editor-layout">
      <div class="back-row">
        ${back(editor.isNew ? "/" : `/song/${song.id}`)}<span class="save-info" id="draft-status"
          >入力内容を下書きに保存します</span
        >
      </div>
      ${title(
        editor.isNew ? "曲名だけで登録できます" : "あとから自由に変更できます",
        editor.isNew ? "曲を追加" : "曲の情報を編集",
      )}
      ${editor.isNew
        ? '<div class="segmented"><button class="active" data-go="/add">1曲ずつ追加</button><button data-go="/bulk">まとめて追加</button></div>'
        : ""}
      <form id="song-editor">
        <div id="editor-error" class="error-box" role="alert" hidden></div>
        <section class="panel section-blue">
          <div class="panel-title">
            <span class="step">01</span>
            <h2>曲のこと</h2>
          </div>
          ${inputField("title", "曲名", "曲名だけで登録できます", {
            required: true,
          })}
          <details
            class="details-section"
            id="artist-editor"
            ${song.artists.length || editor.pendingTags?.artists ? " open" : ""}
          >
            <summary>アーティストを追加・選択（任意）</summary>
            ${tagEditor("artists", "アーティスト", "名前を探す・新しく作る")}
          </details>
          <div class="field-grid">
            <label class="field"
              ><span class="label">歌う分類</span
              ><select data-song-field="categoryId">
                ${options(state.categories, song.categoryId)}
              </select></label
            ><label class="field"
              ><span class="label">知名度／流行度</span
              ><select data-song-field="popularity">
                ${options(POPULARITY, song.popularity)}
              </select></label
            >
          </div>
          <p class="help">歌う分類は、設定から自分好みに変更できます。</p>
        </section>
        <section class="panel section-purple">
          <div class="panel-title">
            <span class="step">02</span>
            <h2>探すための目印</h2>
          </div>
          ${tagEditor("genres", "ジャンル", "ボカロ、アニソン、Jpop…")}${tagEditor(
            "memories",
            "思い出",
            "カゲプロ、学生時代…",
          )}${inputField("year", "時期（西暦）", "例：2020", { max: 4 })}
          <p class="help">
            色付きのタグはタップで選べます。新しい名前は入力して「追加」。カンマ区切りでも追加できます。
          </p>
        </section>
        <details
          class="panel section-orange editor-extra"
          id="singing-notes"
          ${song.keyNote ||
          RANGE_FIELDS.some(
            ([key]) =>
              song.ranges[key].pitch || song.ranges[key].context || song.ranges[key].target,
          )
            ? " open"
            : ""}
        >
          <summary>
            <span class="panel-title"
              ><span class="step">03</span><span class="section-label">歌うときのメモ</span></span
            ><span class="summary-action">開く</span>
          </summary>
          <div class="details-body">
            ${textField("keyNote", "キー変更メモ", "原曲−2、調子がよければ原キー…", 5000)}
            <details
              class="details-section"
              ${RANGE_FIELDS.some(([key]) => song.ranges[key].pitch || song.ranges[key].context)
                ? " open"
                : ""}
            >
              <summary>音域メモを入力する</summary>
              ${RANGE_FIELDS.map(([key, label]) => {
                const range = song.ranges[key];
                return html`<div class="range-group">
                  <h3>${label}</h3>
                  <label class="field"
                    ><span class="label">音高</span
                    ><input
                      data-range="${key}"
                      data-range-field="pitch"
                      value="${e(range.pitch)}"
                      maxlength="100"
                      placeholder="例：hiA、A4" /></label
                  ><label class="field"
                    ><span class="label">付近の歌詞</span
                    ><textarea
                      id="context-${key}"
                      data-range="${key}"
                      data-range-field="context"
                      maxlength="5000"
                      placeholder="その音が出てくる一節"
                    >
${e(range.context)}</textarea
                    ></label
                  ><label class="field"
                    ><span class="label">該当する文字</span
                    ><input
                      id="target-${key}"
                      data-range="${key}"
                      data-range-field="target"
                      value="${e(range.target)}"
                      maxlength="5000"
                      placeholder="例：あ" /></label
                  ><button
                    type="button"
                    class="button subtle small selection-button"
                    data-action="select-range"
                    data-key="${key}"
                  >
                    歌詞で選択した部分を記録
                  </button>
                  <p class="help">一節の中の文字を選択してから、このボタンを押せます。</p>
                </div>`;
              }).join("")}
            </details>
          </div>
        </details>
        <details
          class="panel section-green editor-extra"
          id="lyrics-notes"
          ${song.lyrics || song.notes ? " open" : ""}
        >
          <summary>
            <span class="panel-title"
              ><span class="step">04</span><span class="section-label">歌詞とその他メモ</span></span
            ><span class="summary-action">開く</span>
          </summary>
          <div class="details-body">
            ${textField(
              "lyrics",
              "歌詞",
              "改行したまま保存できます。詳細画面でゆっくり読めます。",
              200000,
              "lyrics-input",
            )}${textField(
              "notes",
              "その他メモ",
              "歌い出しの注意や、思い出したことを自由に。",
              50000,
            )}
          </div>
        </details>
        <div class="editor-footer">
          <button type="button" class="button secondary" data-action="discard-editor">破棄</button
          ><button type="submit" class="button primary">
            ${editor.isNew ? "この曲を登録する" : "変更を保存する"}
          </button>
        </div>
      </form>
    </div>`;
  }

  return renderEditor();
}
