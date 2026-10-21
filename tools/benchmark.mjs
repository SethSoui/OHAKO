import { fixture } from "./fixtures.mjs";
import {
  clone,
  validateState,
  makeBackup,
  readBackup,
  searchSongs,
  categoryOf,
  e,
} from "../model.mjs";
import { pageOf, compactRows } from "../list-view.mjs";
import { openStorage } from "../storage.mjs";
const $ = (selector) => document.querySelector(selector),
  stage = $("#stage");
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const timed = (fn, loops = 3) => {
  const values = [];
  for (let i = 0; i < loops; i++) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  return median(values);
};
function oldSearch(state, query = "", sort = "updated") {
  const normalize = (value) => String(value).normalize("NFKC").toLocaleLowerCase("ja").trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return state.songs
    .filter((song) => {
      const haystack = normalize(
        [
          song.title,
          ...song.artists,
          ...song.genres,
          ...song.memories,
          song.notes,
          song.keyNote,
        ].join(" "),
      );
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "ja", { numeric: true })
        : b.updatedAt.localeCompare(a.updatedAt) ||
          a.title.localeCompare(b.title, "ja", { numeric: true }),
    );
}
function oldRows(songs, state) {
  return `<div class="song-list">${songs.map((song, index) => `<a class="song-card" href="#"><span class="song-index">${String(index + 1).padStart(2, "0")}</span><div class="song-body"><div class="song-topline"><span class="badge color-blue">${e(categoryOf(state, song.categoryId).label)}</span><span class="tag">歌詞あり</span></div><h2 class="song-title">${e(song.title)}</h2><p class="song-artist">${e(song.artists.join(" / "))}</p><div class="tag-row">${[...song.genres, ...song.memories].map((tag) => `<span class="tag">${e(tag)}</span>`).join("")}${song.keyNote ? `<span class="key-inline">♮ ${e(song.keyNote)}</span>` : ""}</div></div><span class="arrow">›</span></a>`).join("")}</div>`;
}

$("#run").addEventListener("click", async () => {
  $("#run").disabled = true;
  $("#results").textContent = "測定中…";
  try {
    const data = fixture(),
      json = makeBackup(data),
      results = {
        environment: {
          userAgent: navigator.userAgent,
          viewport: `${innerWidth} × ${innerHeight}`,
        },
        count: data.songs.length,
        lyricsCharactersPerSong: data.songs[0].lyrics.length,
        jsonMiB: new Blob([json]).size / 1024 / 1024,
      };
    results.oldInitialSearchMs = timed(() => oldSearch(data));
    results.newInitialSearchMs = timed(() => searchSongs(data));
    results.oldTitleSortMs = timed(() => oldSearch(data, "", "title"));
    results.newTitleSortMs = timed(() => searchSongs(data, "", {}, "title"));
    results.oldSearchMs = timed(() => oldSearch(data, "架空の歌手49"));
    searchSongs(data, "架空の歌手49");
    results.newWarmSearchMs = timed(() => searchSongs(data, "架空の歌手49"));
    results.cloneMs = timed(() => clone(data));
    results.validateMs = timed(() => validateState(data));
    results.exportMs = timed(() => makeBackup(data));
    results.importMs = timed(() => readBackup(json));
    results.oldDomAndLayoutMs = timed(() => {
      stage.innerHTML = oldRows(data.songs, data);
      void stage.offsetHeight;
    });
    results.oldDomRows = stage.querySelectorAll(".song-card").length;
    results.oldRowHeight = stage.querySelector(".song-card").getBoundingClientRect().height;
    results.newDomAndLayoutMs = timed(() => {
      stage.innerHTML = compactRows(pageOf(data.songs).songs, data);
      void stage.offsetHeight;
    });
    results.newDomRows = stage.querySelectorAll(".song-row").length;
    results.newRowHeight = stage.querySelector(".song-row").getBoundingClientRect().height;
    const store = await openStorage("ohako-benchmark-v1");
    await store.put("library", undefined);
    let current = data;
    const writes = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const next = clone(current);
      next.songs[0].notes = `試験${i}`;
      current = await store.save(next, current.revision);
      writes.push(performance.now() - start);
    }
    results.wholeLibrarySaveMs = median(writes);
    const start = performance.now();
    await store.load();
    results.wholeLibraryLoadMs = performance.now() - start;
    await store.put("library", undefined);
    store.close();

    $("#results").textContent = JSON.stringify(results, null, 2);
  } catch (error) {
    $("#results").textContent = error.stack;
  } finally {
    $("#run").disabled = false;
  }
});
$("#download").addEventListener("click", () => {
  const file = new Blob([makeBackup(fixture())], { type: "application/json" }),
    link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "ohako-benchmark-2000.ohako.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
});
