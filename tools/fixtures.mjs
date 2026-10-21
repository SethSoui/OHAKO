import {initialState,emptySong,POPULARITY} from '../model.mjs';
export function fixture(count=2000,lyricsLength=1500) {
  const state=initialState();
  const line='架空の歌のことばを並べて、夜明けの空を見上げている。\n';
  const lyrics=line.repeat(Math.ceil(lyricsLength/line.length)).slice(0,lyricsLength);
  for(let i=0;i<count;i++){
    const song=emptySong();
    Object.assign(song,{title:`試験曲${String(i+1).padStart(4,'0')} · ${i%3===0?'冬の空に思いをのせて、長い曲名の最後まで読めるか確認するための架空の楽曲':'冬のレパートリー'}`,artists:[`架空の歌手${i%50}`],genres:[`ジャンル${i%20}`,i%2?'Jpop':'アニソン'],memories:[`思い出${i%7}`],categoryId:state.categories[i%5].id,popularity:POPULARITY[i%4],year:String(2000+i%27),lyrics,notes:'動作確認用に自動生成した架空の楽曲です。実際の曲や歌詞ではありません。',keyNote:i%4?'':'原曲−2'});
    state.songs.push(song);
  }
  return state;
}
