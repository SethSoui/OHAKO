import test from "node:test";
import assert from "node:assert/strict";
import { initialState, makeBackup, readBackup, validateState, searchSongs } from "../model.mjs";
import { pageOf, compactRows, PAGE_SIZE } from "../list-view.mjs";
import { fixture } from "../tools/fixtures.mjs";
test("2,000 songs are searched globally but only 100 rows are rendered per page", () => {
  const state = fixture(2000, 10),
    all = searchSongs(state);
  assert.equal(all.length, 2000);
  assert.equal(pageOf(all).pages, 20);
  assert.equal(
    (compactRows(pageOf(all).songs, state).match(/class="song-row/g) ?? []).length,
    PAGE_SIZE,
  );
  const last = searchSongs(state, "試験曲2000");
  assert.equal(last.length, 1);
  assert.equal(pageOf(last, 19).page, 0);
  assert.equal(pageOf(all, 999).page, 19);
  assert.equal(pageOf([], 999).page, 0);
});
test("legacy backup receives icons and display defaults while custom appearances round-trip", () => {
  const state = initialState(),
    backup = JSON.parse(makeBackup(state));
  backup.data.categories.forEach((category) => delete category.icon);
  delete backup.data.preferences.showArtists;
  delete backup.data.preferences.animateTitles;
  const result = readBackup(JSON.stringify(backup)).data;
  assert.equal(result.categories[0].icon, "star");
  assert.equal(result.preferences.showArtists, false);
  assert.equal(result.preferences.animateTitles, true);
  result.categories[0].icon = "headphones";
  result.preferences.showArtists = true;
  assert.deepEqual(readBackup(makeBackup(result)).data, result);
  result.categories[0].icon = "<script>";
  assert.throws(() => validateState(result));
});
test("compact row safely escapes titles and leaves optional artist text out by default", () => {
  const state = fixture(1, 10);
  state.songs[0].title = "<img src=x onerror=alert(1)>";
  const markup = compactRows(state.songs, state);
  assert.ok(markup.includes("&lt;img"));
  assert.ok(!markup.includes("<img"));
  assert.ok(!markup.includes("row-artist"));
  state.preferences.showArtists = true;
  assert.ok(compactRows(state.songs, state).includes("row-artist"));
});
test("search cache notices changes to the same song object and array", () => {
  const state = fixture(1, 10);
  assert.equal(searchSongs(state, "変更した歌手").length, 0);
  state.songs[0].artists.push("変更した歌手");
  assert.equal(searchSongs(state, "変更した歌手").length, 1);
});
