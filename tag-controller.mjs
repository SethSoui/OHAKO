import { e, uniq } from "./model.mjs";
import { TAG_GROUPS, addCatalogTag, removeCatalogTag, restoreCatalogTag } from "./tag-model.mjs";
import {
  indexedTags,
  tagManagerMarkup,
  tagManagerResults,
  tagPickerBody,
  colorChoices,
} from "./tag-view.mjs";

export function createTagController({
  getState,
  getEditor,
  commit,
  modal,
  toast,
  renderRoute,
  scheduleDraft,
  refreshEditor,
}) {
  const $ = (selector) => document.querySelector(selector);
  let managerKey = "genres",
    managerQuery = "",
    managerPage = 0;
  let picker = null,
    colorDraft = "blue",
    removal = null,
    inputTimer;

  function refreshManager() {
    $("#tag-manager-results").innerHTML = tagManagerResults(
      getState(),
      managerKey,
      managerQuery,
      managerPage,
    );
  }
  function refreshPicker() {
    if (!picker || !$("#tag-picker-results")) return;
    $("#tag-picker-results").innerHTML = tagPickerBody(
      getState(),
      picker.key,
      getEditor().song[picker.key],
      picker.query,
      picker.page,
    );
  }
  function toggleTag(key, name) {
    const editor = getEditor();
    if (!editor || !Object.hasOwn(TAG_GROUPS, key)) return;
    const selected = editor.song[key].includes(name);
    if (!selected && editor.song[key].length >= 100)
      throw new Error("1曲につき各100件まで選べます。");
    editor.song[key] = selected
      ? editor.song[key].filter((value) => value !== name)
      : uniq([...editor.song[key], name]);
    refreshEditor(key);
    refreshPicker();
    scheduleDraft();
  }
  function handleTransient(action, node) {
    if (action === "select-tag") {
      toggleTag(node.dataset.key, node.dataset.value);
      return true;
    }
    if (action === "picker-page" && picker) {
      picker.page = Number(node.dataset.page);
      refreshPicker();
      return true;
    }
    if (action === "tag-color-choice") {
      colorDraft = node.dataset.value;
      document.querySelectorAll('[data-action="tag-color-choice"]').forEach((button) => {
        const selected = button === node;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      $("#tag-color-preview").className = `tag-pill color-${colorDraft}`;
      return true;
    }
    return false;
  }
  async function handleAction(action, node) {
    const key = node.dataset.key,
      name = node.dataset.value;
    switch (action) {
      case "browse-tags": {
        picker = { key, query: "", page: 0 };
        const original = [...getEditor().song[key]];
        const accepted = await modal({
          title: `${TAG_GROUPS[key].label}を選ぶ`,
          html: `<label class="field"><span class="label">名前で探す</span><input id="tag-picker-search" type="search" placeholder="タグを検索" autocomplete="off"></label><div class="picker-scroll" id="tag-picker-results">${tagPickerBody(getState(), key, original)}</div>`,
          confirm: "選択を決定",
        });
        if (!accepted && getEditor()) {
          getEditor().song[key] = original;
          refreshEditor(key);
          scheduleDraft();
        }
        picker = null;
        return true;
      }
      case "create-catalog-tag": {
        const value = $("#new-tag-name").value;
        await commit((next) => addCatalogTag(next, key, value));
        managerQuery = "";
        managerPage = 0;
        await renderRoute(true);
        toast("タグを作りました。曲の登録画面で選べます。");
        return true;
      }
      case "tag-manager-page":
        managerPage = Number(node.dataset.page);
        refreshManager();
        $("#tag-manager-search").scrollIntoView({ block: "start" });
        return true;
      case "tag-color": {
        const tag = indexedTags(getState())[key].get(name);
        colorDraft = tag.color;
        if (
          await modal({
            title: "タグの色を選ぶ",
            html: `<p><span id="tag-color-preview" class="tag-pill color-${tag.color}">${e(name)}</span></p>${colorChoices(tag.color)}`,
            confirm: "この色にする",
          })
        ) {
          await commit((next) => {
            next.tagCatalog[key].find((tag) => tag.name === name).color = colorDraft;
          });
          refreshManager();
          toast("タグの色を変更しました");
        }
        return true;
      }
      case "delete-catalog-tag": {
        const tag = indexedTags(getState())[key].get(name);
        if (
          await modal({
            title: `「${name}」のタグを削除？`,
            message: `保存済みの${tag.total}曲（ゴミ箱を含む）から、このタグを外します。曲や歌詞は消えません。下書きは変更しません。\n\n削除後、この画面の「元に戻す」で取り消せます。`,
            confirm: "タグを削除",
            danger: true,
          })
        ) {
          let deleted;
          await commit((next) => {
            deleted = removeCatalogTag(next, key, name);
          });
          removal = deleted;
          managerPage = 0;
          await renderRoute(true);
          toast("タグを削除しました。元に戻すこともできます。");
        }
        return true;
      }
      case "undo-tag-delete":
        if (removal) {
          await commit((next) => restoreCatalogTag(next, removal));
          removal = null;
          await renderRoute(true);
          toast("タグと曲への設定を戻しました");
        }
        return true;
      default:
        return false;
    }
  }
  function handleInput(node) {
    if (node.id === "tag-manager-search") {
      managerQuery = node.value;
      managerPage = 0;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(refreshManager, 80);
      return true;
    }
    if (node.id === "tag-picker-search" && picker) {
      picker.query = node.value;
      picker.page = 0;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(refreshPicker, 80);
      return true;
    }
    return false;
  }
  return {
    handleTransient,
    handleAction,
    handleInput,
    leaveRoute() {
      clearTimeout(inputTimer);
    },
    reset() {
      removal = null;
      managerQuery = "";
      managerPage = 0;
    },
    markup(key) {
      if (key !== managerKey) {
        managerQuery = "";
        managerPage = 0;
        managerKey = key;
      }
      return tagManagerMarkup(getState(), key, managerQuery, managerPage, removal);
    },
  };
}
