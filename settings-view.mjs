import { e, activeSongs } from "./model.mjs";
import { TAG_GROUPS } from "./tag-model.mjs";
import { categoryMarker } from "./list-view.mjs";
import { title, icon, dateLabel, hexColor, html } from "./ui.mjs";

export function themeEditorMarkup(theme) {
  return [
    ["background", "背景色"],
    ["accent", "アクセント色"],
  ]
    .map(
      ([key, label]) =>
        html` <div class="theme-group">
          <div class="theme-heading">
            <h3>${label}</h3>
            <label class="color-picker-label"
              ><span class="sr-only">${label}を選ぶ</span
              ><input
                type="color"
                data-theme-picker="${key}"
                value="${hexColor(theme[key])}"
                aria-label="${label}を選ぶ"
            /></label>
          </div>
          <div class="rgb-grid">
            ${["R", "G", "B"]
              .map(
                (channel, index) =>
                  html`<label
                    ><span>${channel}</span
                    ><input
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="255"
                      step="1"
                      data-theme-channel="${key}"
                      data-channel="${index}"
                      value="${theme[key][index]}"
                      aria-label="${label} ${channel}"
                  /></label>`,
              )
              .join("")}
          </div>
        </div>`,
    )
    .join("");
}

function categorySettings(state) {
  return html`<details class="settings-details" id="category-settings">
    <summary><span>★ 歌う分類をカスタマイズ</span><span class="summary-action">開く</span></summary>
    <div class="details-body">
      <p class="help">名前・順番・目印を変更できます。左のアイコンを押すと色も選べます。</p>
      ${state.categories
        .map(
          (category, index) =>
            html`<div class="category-edit">
              <button
                class="category-appearance-button"
                data-action="category-appearance"
                data-id="${category.id}"
                aria-label="${e(category.label)}のアイコンと色"
              >
                ${categoryMarker(category)}</button
              ><label class="sr-only" for="category-${category.id}"
                >分類「${e(category.label)}」の名前</label
              ><input
                id="category-${category.id}"
                value="${e(category.label)}"
                maxlength="80"
              /><button
                class="save-category"
                data-action="rename-category"
                data-id="${category.id}"
                aria-label="${e(category.label)}の名前を保存"
              >
                保存</button
              ><button
                class="icon-button"
                data-action="move-category"
                data-id="${category.id}"
                data-direction="-1"
                aria-label="${e(category.label)}を上へ"
                ${index === 0 ? " disabled" : ""}
              >
                ↑</button
              ><button
                class="icon-button"
                data-action="move-category"
                data-id="${category.id}"
                data-direction="1"
                aria-label="${e(category.label)}を下へ"
                ${index === state.categories.length - 1 ? " disabled" : ""}
              >
                ↓</button
              ><button
                class="icon-button delete-category"
                data-action="delete-category"
                data-id="${category.id}"
                aria-label="${e(category.label)}を削除"
              >
                ×
              </button>
            </div>`,
        )
        .join("")}
      <div class="category-add">
        <input
          class="plain-input"
          id="new-category"
          maxlength="80"
          placeholder="新しい分類名"
          aria-label="新しい分類名"
        /><button class="button secondary small" data-action="new-category">＋ 追加</button>
      </div>
    </div>
  </details>`;
}

export function settingsMarkup(state, { offlineReady, rollbackAvailable }) {
  const songs = activeSongs(state),
    trash = state.songs.length - songs.length;
  const changed = state.revision !== state.lastExportRevision;
  return html`<div class="settings-layout">
    ${title("自分らしく、使いやすく", "設定")}
    <div class="settings-shortcuts" aria-label="設定の項目">
      <button class="shortcut color-blue" data-action="settings-section" data-value="tags-settings">
        <span aria-hidden="true">＃</span>タグと分類<span aria-hidden="true">↓</span>
      </button>
      <button
        class="shortcut color-purple"
        data-action="settings-section"
        data-value="display-settings"
      >
        <span aria-hidden="true">◐</span>見た目<span aria-hidden="true">↓</span>
      </button>
      <button
        class="shortcut color-green"
        data-action="settings-section"
        data-value="backup-settings"
      >
        <span aria-hidden="true">↗</span>バックアップ<span aria-hidden="true">↓</span>
      </button>
      <button
        class="shortcut color-orange"
        data-action="settings-section"
        data-value="device-settings"
      >
        <span aria-hidden="true">▣</span>この端末<span aria-hidden="true">↓</span>
      </button>
    </div>
    <section class="panel section-blue" id="tags-settings">
      <div class="panel-title">
        <span class="step" aria-hidden="true">＃</span>
        <h2>タグと分類</h2>
      </div>
      <p class="section-description">
        目印をそろえて、選びやすく。タグの追加・色変更・削除ができます。
      </p>
      <div class="settings-tiles">
        ${Object.entries(TAG_GROUPS)
          .map(
            ([key, group]) =>
              `<button class="settings-tile color-${group.color}" data-go="/tags/${key}"><span class="tile-symbol" aria-hidden="true">${group.symbol}</span><span><strong>${group.label}</strong><small>${state.tagCatalog[key].length}件のタグ</small></span><span aria-hidden="true">›</span></button>`,
          )
          .join("")}
      </div>
      ${categorySettings(state)}
    </section>
    <section class="panel section-purple" id="display-settings">
      <div class="panel-title">
        <span class="step" aria-hidden="true">◐</span>
        <h2>見た目と読みやすさ</h2>
      </div>
      <label class="check-row list-preference"
        ><input
          type="checkbox"
          id="show-artists"
          ${state.preferences.showArtists ? " checked" : ""}
        /><span>一覧にアーティスト名を表示する</span></label
      >
      <label class="check-row list-preference"
        ><input
          type="checkbox"
          id="animate-titles"
          ${state.preferences.animateTitles ? " checked" : ""}
        /><span>長い曲名をゆっくり横に流す</span></label
      >
      <p class="help">
        画面内の長い曲名だけ動かします。端末で動きを減らす設定にしている場合は停止します。
      </p>
      <div class="setting-row">
        <div>
          <strong>歌詞の文字サイズ</strong>
          <p class="help">詳細画面でも変えられます</p>
        </div>
        <select id="lyrics-size" aria-label="歌詞の文字サイズ">
          ${[16, 18, 20, 24, 28]
            .map(
              (value) =>
                html`<option
                  value="${value}"
                  ${state.preferences.lyricsFont === value ? " selected" : ""}
                >
                  ${value}
                </option>`,
            )
            .join("")}
        </select>
      </div>
      <details class="settings-details" id="theme-settings">
        <summary>
          <span>🎨 テーマカラーを変える</span><span class="summary-action">開く</span>
        </summary>
        <div class="details-body">
          <p class="help">
            背景とアクセントをRGBで自由に変更できます。操作を見分ける色は、それぞれの役割に合わせて表示します。
          </p>
          <div id="theme-editor">${themeEditorMarkup(state.preferences.theme)}</div>
          <div class="actions">
            <button class="button primary" data-action="save-theme">この配色を保存</button
            ><button class="button secondary small" data-action="reset-theme">
              冬の配色に戻す
            </button>
          </div>
          <p class="help" id="theme-status">文字色は背景に合わせて調整します。</p>
        </div>
      </details>
    </section>
    <section class="panel section-green" id="backup-settings">
      <div class="panel-title">
        <span class="step" aria-hidden="true">↗</span>
        <h2>データを持ち出す・戻す</h2>
      </div>
      <div class="backup-status${changed && state.songs.length ? " changed" : ""}">
        <strong
          >${state.songs.length
            ? changed
              ? "書き出し後に変更があります"
              : "前回の書き出しから変更はありません"
            : "まだ楽曲が登録されていません"}</strong
        ><br />前回のJSON書き出し：${dateLabel(state.lastExportAt)}<br />登録 ${songs.length}曲 ／
        ゴミ箱 ${trash}曲
      </div>
      <div class="backup-buttons">
        <button class="button success" data-action="export-json">
          ${icon("export")}JSONを書き出す</button
        ><button class="button secondary" data-action="choose-import">
          ${icon("import")}JSONから復元
        </button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden />
      <p class="help">
        全楽曲・歌詞・タグの色・設定をひとつのJSONに。「ファイルに保存」でiCloud
        Driveなどへ保存できます。復元すると全体を置き換えます。
      </p>
      ${rollbackAvailable
        ? '<button class="button secondary small" data-action="undo-restore">直前のJSON復元を取り消す</button>'
        : ""}
      <details class="settings-details">
        <summary>
          <span>表計算用のCSVを書き出す</span><span class="summary-action">開く</span>
        </summary>
        <div class="details-body">
          <label class="check-row"
            ><input type="checkbox" id="csv-lyrics" checked />CSVに歌詞を含める</label
          ><button class="button secondary full" data-action="export-csv">CSVを書き出す</button>
          <p class="help">CSVは閲覧・加工用です。完全な復元にはJSONを使います。</p>
        </div>
      </details>
    </section>
    <section class="panel section-orange" id="device-settings">
      <div class="panel-title">
        <span class="step" aria-hidden="true">▣</span>
        <h2>この端末とデータ</h2>
      </div>
      <div class="setting-row">
        <div>
          <strong>登録数とデータ容量</strong>
          <p class="help">JSONと端末内の容量を確認</p>
        </div>
        <button class="button secondary small" data-action="capacity">容量を確認</button>
      </div>
      <div class="setting-row">
        <div>
          <strong>オフラインの準備</strong>
          <p class="help" id="offline-status">
            ${offlineReady ? "✓ 準備できています" : "準備中、またはこのブラウザでは利用できません"}
          </p>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>端末内データの保持</strong>
          <p class="help">自動削除を抑えるよう依頼します</p>
        </div>
        <button class="button secondary small" data-action="persist">設定する</button>
      </div>
      <button class="button secondary full" data-go="/trash">ゴミ箱を見る（${trash}曲） ›</button>
      <details class="settings-details">
        <summary>
          <span>OHAKOについて・サンプル</span><span class="summary-action">開く</span>
        </summary>
        <div class="details-body">
          <p class="privacy-note">
            曲・歌詞・メモはこの端末のブラウザ内に保存します。アカウント・データ送信・アクセス解析はありません。ほかの端末には自動同期されません。
          </p>
          <p class="privacy-note">
            サイトデータの削除や端末故障に備え、JSONをときどきiCloud
            Driveなどへ保存してください。書き出したファイルは暗号化されていません。
          </p>
          <p class="privacy-note">
            iPhoneではSafariの共有メニューから「ホーム画面に追加」すると、アプリのように開けます。
          </p>
          <button class="button secondary small" data-action="samples">
            架空のサンプル3曲で試す
          </button>
          <p class="help">OHAKO-18番- · v1.2.0</p>
        </div>
      </details>
    </section>
  </div>`;
}
