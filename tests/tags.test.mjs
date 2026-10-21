import test from "node:test";
import assert from "node:assert/strict";
import { initialState, emptySong, validateState, makeBackup, readBackup } from "../model.mjs";
import {
  addCatalogTag,
  removeCatalogTag,
  restoreCatalogTag,
  tagIndex,
  findTags,
} from "../tag-model.mjs";
import { tagEditorMarkup, tagManagerResults, filterTagChoices } from "../tag-view.mjs";

function library() {
  const state = initialState();
  const song = {
    ...emptySong(),
    title: "曲A",
    genres: ["ゲーム音楽"],
    memories: ["学生時代"],
  };
  const trash = {
    ...emptySong(),
    title: "曲B",
    genres: ["ゲーム音楽"],
    deletedAt: new Date().toISOString(),
  };
  state.songs.push(song, trash);
  return validateState(state);
}

test("version 1 backup migrates tag names, colors and unused catalog entries without losing lyrics", () => {
  const state = library();
  state.songs[0].lyrics = "あの日の歌\nもう一度";
  const old = JSON.parse(makeBackup(state));
  old.version = old.data.schemaVersion = 1;
  delete old.data.tagCatalog;
  const migrated = readBackup(JSON.stringify(old)).data;
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.tagCatalog.genres.find((tag) => tag.name === "ゲーム音楽").color, "blue");
  assert.equal(migrated.songs[0].lyrics, state.songs[0].lyrics);
  addCatalogTag(migrated, "memories", "まだ曲に付けていないタグ", "orange");
  migrated.tagCatalog.genres[0].color = "pink";
  assert.deepEqual(readBackup(makeBackup(migrated)).data, migrated);
});

test("deleting a tag detaches it from active and trashed songs; undo keeps later edits", () => {
  const state = library();
  const originalIds = state.songs.map((song) => song.id);
  const deleted = removeCatalogTag(state, "genres", "ゲーム音楽");
  assert.equal(deleted.assignments.length, 2);
  assert.ok(state.songs.every((song) => !song.genres.includes("ゲーム音楽")));
  assert.deepEqual(
    state.songs.map((song) => song.id),
    originalIds,
  );
  state.songs[0].title = "後で編集した曲名";
  state.songs[0].genres.push("追加した目印");
  restoreCatalogTag(state, deleted);
  assert.deepEqual(state.songs[0].genres, ["ゲーム音楽", "追加した目印"]);
  assert.equal(state.songs[0].title, "後で編集した曲名");
  assert.ok(state.songs[1].deletedAt);
});

test("deleted default choices stay deleted after save, reload and JSON restoration", () => {
  const state = library();
  removeCatalogTag(state, "genres", "ボカロ");
  assert.ok(
    !readBackup(makeBackup(state)).data.tagCatalog.genres.some((tag) => tag.name === "ボカロ"),
  );
});

test("tag names, unknown colors and duplicate catalog entries are validated", () => {
  const state = library();
  addCatalogTag(state, "genres", "NewTag");
  assert.throws(() => addCatalogTag(state, "genres", "ＮＥＷＴＡＧ"));
  assert.throws(() => addCatalogTag(state, "genres", "二つ,タグ"));
  for (const color of ["invalid", "__proto__", "blue; color:red"]) {
    const invalid = structuredClone(state);
    invalid.tagCatalog.genres[0].color = color;
    assert.throws(() => validateState(invalid));
  }
  state.tagCatalog.genres.push(state.tagCatalog.genres[0]);
  assert.throws(() => validateState(state));
});

test("2,000 catalog choices are counted once and searched across bounded result pages", () => {
  const state = library();
  state.tagCatalog.genres = Array.from({ length: 2000 }, (_, i) => ({
    name: `タグ${i + 1}`,
    color: "blue",
  }));
  const current = validateState(state),
    index = tagIndex(current);
  assert.equal(index.genres.get("ゲーム音楽").count, 1);
  assert.equal(index.genres.get("ゲーム音楽").total, 2);
  assert.equal(findTags(index, "genres").tags.length, 8);
  assert.equal(
    (filterTagChoices(current, "genres", []).match(/data-action="toggle-filter-tag"/g) ?? [])
      .length,
    40,
  );
  assert.equal(findTags(index, "genres", "タグ2000").tags.length, 1);
  assert.equal(findTags(index, "genres", "", { limit: 40, offset: 2000 }).tags.length, 1);
  assert.equal(
    (tagManagerResults(current, "genres", "", 0).match(/class="managed-tag"/g) ?? []).length,
    40,
  );
});

test("colored picker escapes text and exposes selection state as buttons", () => {
  const state = library();
  addCatalogTag(state, "memories", "<img src=x onerror=alert(1)>", "pink");
  const current = validateState(state);
  const editor = { song: current.songs[0], pendingTags: {} };
  const markup = tagEditorMarkup(current, editor, "memories", "思い出", "新しいタグ");
  assert.ok(markup.includes("&lt;img"));
  assert.ok(!markup.includes("<img"));
  assert.ok(markup.includes('aria-pressed="true"'));
  assert.ok(markup.includes("color-pink"));
});
