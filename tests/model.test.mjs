import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,emptySong,validateState,makeBackup,readBackup,makeCsv,searchSongs,parseBulk,excerptMarkup,samples,DEFAULT_THEME,validateTheme,themeProperties} from '../model.mjs';

function fixture() {
  const state = initialState(), song = emptySong();
  Object.assign(song,{title:'日本語の「歌」',artists:['歌手A','歌手B'],genres:['ボカロ','アニソン'],memories:['カゲプロ'],categoryId:state.categories[0].id,popularity:'一部の',year:'2020',keyNote:'原曲−2',lyrics:'1行目\n2行目 "quote"\n<script>危険ではなく文字列</script>',notes:'長めのメモ\n次の行'});
  song.ranges.chest = {pitch:'hiA',context:'ああああ',target:'あ',start:2};
  state.songs.push(song); state.categories[0].label = '自分の十八番'; state.preferences.lyricsFont = 24;
  const deleted = emptySong(); deleted.title = 'ゴミ箱の曲'; deleted.deletedAt = new Date().toISOString(); state.songs.push(deleted);
  return state;
}

test('JSON round-trip preserves every song field, highlights, category settings, preferences and trash',() => {
  const state = fixture();
  assert.deepEqual(readBackup(makeBackup(state)).data,state);
});
test('unknown format, future schema, invalid references, duplicate ids and missing titles are rejected',() => {
  for (const mutate of [x => { x.format = 'other'; },x => { x.version = 2; },x => { x.data.schemaVersion = 2; },x => { x.data.songs[0].categoryId = 'missing'; },x => { x.data.songs.push(x.data.songs[0]); },x => { x.data.songs[0].title = ''; }]) {
    const backup = JSON.parse(makeBackup(fixture())); mutate(backup); assert.throws(() => readBackup(JSON.stringify(backup)));
  }
  assert.throws(() => readBackup('{bad json}'));
});
test('untrusted properties are discarded rather than merged into runtime objects',() => {
  const backup = JSON.parse(makeBackup(fixture()));
  backup.data.songs[0].__proto__ = {polluted:true};
  backup.data.songs[0].html = '<script>bad()</script>';
  const result = readBackup(JSON.stringify(backup));
  assert.equal(result.data.songs[0].html,undefined); assert.equal({}.polluted,undefined);
});
test('CSV quotes newlines and commas, neutralizes formulas, excludes trash and optionally excludes lyrics',() => {
  const state = fixture(); state.songs[0].title = '=HYPERLINK("https://invalid.test")';
  const csv = makeCsv(state);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"\'=HYPERLINK(""https://invalid.test"")"'));
  assert.ok(csv.includes('1行目\n2行目 ""quote""'));
  assert.ok(!csv.includes('ゴミ箱の曲')); assert.ok(!makeCsv(state,false).includes('1行目'));
});
test('search normalizes full-width text and combines words, tags and different filter groups',() => {
  const state = fixture(); state.songs[0].title = 'ＡＢＣの歌';
  assert.equal(searchSongs(state,'abc 歌手b').length,1);
  assert.equal(searchSongs(state,'',{genres:['存在しない','アニソン'],memories:['カゲプロ'],year:'2020',lyrics:'yes'}).length,1);
  assert.equal(searchSongs(state,'',{genres:['アニソン'],memories:['違う']}).length,0);
  assert.equal(searchSongs(state,'',{category:'__unset'}).length,0);
});
test('bulk input supports blank lines, CRLF and tab-separated artist columns',() => {
  assert.deepEqual(parseBulk('曲A\t歌手A、歌手B\r\n\r\n曲B\n'),[{line:1,title:'曲A',artists:['歌手A','歌手B']},{line:3,title:'曲B',artists:[]}]);
});
test('selected occurrence is retained and HTML-looking lyrics are escaped',() => {
  assert.equal(excerptMarkup({context:'あああ',target:'あ',start:1}),'あ<mark>あ</mark>あ');
  assert.equal(excerptMarkup({context:'<script>',target:'script',start:1}),'&lt;<mark>script</mark>&gt;');
});
test('category names are unique after normalization and sample records are valid',() => {
  const state = initialState(); state.songs = samples(); assert.equal(validateState(state).songs.length,3);
  state.categories[1].label = state.categories[0].label; assert.throws(() => validateState(state));
});
test('RGB theme is validated, portable, and defaults are added to older backups',() => {
  const state=fixture(); state.preferences.theme={background:[12,24,36],accent:[255,0,128]};
  assert.deepEqual(readBackup(makeBackup(state)).data.preferences.theme,state.preferences.theme);
  const old=JSON.parse(makeBackup(state)); delete old.data.preferences.theme;
  assert.deepEqual(readBackup(JSON.stringify(old)).data.preferences.theme,DEFAULT_THEME);
  for(const value of [-1,256,1.1,'0; color:red']) assert.throws(()=>validateTheme({background:[value,0,0],accent:[0,0,0]}));
  assert.ok(themeProperties(state.preferences.theme)['--accent'].includes('255, 0, 128'));
  assert.equal(themeProperties({background:[0,0,0],accent:[255,255,255]})['--ink'],'rgb(255, 255, 255)');
});
