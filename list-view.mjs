import {e,categoryOf,CATEGORY_ICONS} from './model.mjs';
export const PAGE_SIZE = 100;
export const ICON_LABELS = {star:'星',heart:'ハート',mic:'マイク',practice:'練習',moon:'月',note:'音符',flag:'旗',headphones:'ヘッドホン'};
const PATHS = {
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  heart:'<path d="M20.2 5.8a5 5 0 0 0-7.1 0L12 6.9l-1.1-1.1a5 5 0 0 0-7.1 7.1L12 21l8.2-8.1a5 5 0 0 0 0-7.1Z"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v4m-4 0h8"/>',
  practice:'<path d="m5 16 11-11 3 3L8 19l-4 1Z M14 7l3 3 M4 4h6M4 8h3"/>',
  moon:'<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  note:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="5.5" cy="18" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="16" rx="3.5" ry="2.5"/>',
  flag:'<path d="M5 22V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  headphones:'<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>'
};
export const categoryIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[CATEGORY_ICONS.includes(name) ? name : 'note']}</svg>`;
export const categoryMarker = category => `<span class="category-marker color-${category?.color ?? 'gray'}" title="${e(category?.label ?? '未設定')}">${category ? categoryIcon(category.icon) : '<span aria-hidden="true">·</span>'}</span>`;
export function pageOf(songs,page=0) {
  const pages=Math.max(1,Math.ceil(songs.length/PAGE_SIZE));
  const current=Math.min(Math.max(0,Number.isInteger(page)?page:0),pages-1);
  return {page:current,pages,start:current*PAGE_SIZE,end:Math.min(songs.length,(current+1)*PAGE_SIZE),songs:songs.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE)};
}
export function compactRows(songs,state) {
  return `<ul class="song-list compact-list">${songs.map(song=>{
    const category=categoryOf(state,song.categoryId), count=song.genres.length+song.memories.length, lyrics=!!song.lyrics.trim();
    const metadata=[category?.label ?? '未設定',count?`タグ${count}件`:'',lyrics?'歌詞あり':''].filter(Boolean).join('、');
    return `<li><a class="song-row${state.preferences.showArtists && song.artists.length ? ' with-artist' : ''}" href="#/song/${song.id}" aria-label="${e(song.title)}の詳細。${e(metadata)}">${categoryMarker(category)}<span class="row-main"><span class="row-title"><span class="title-track">${e(song.title)}</span></span>${state.preferences.showArtists && song.artists.length ? `<span class="row-artist">${e(song.artists.join(' / '))}</span>`:''}</span><span class="row-meta" aria-hidden="true">${count?`<span class="tag-count" title="${e([...song.genres,...song.memories].join(' / '))}">#<small>${count}</small></span>`:''}${lyrics?'<svg class="lyrics-icon" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h7"/></svg>':''}</span></a></li>`;
  }).join('')}</ul>`;
}

export function installMarquees(container,enabled=true) {
  container.querySelectorAll('.row-title').forEach(title=>title.classList.toggle('title-overflow',title.firstElementChild.scrollWidth-title.clientWidth>4));
  if (!enabled || !('IntersectionObserver' in window)) return ()=>{};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'), timers=new Map(), visible=new Set();
  let stopped=false,scrollTimer,resizeFrame;
  const titles=[...container.querySelectorAll('.row-title')];
  const stop=title=>{clearTimeout(timers.get(title));timers.delete(title);title.classList.remove('marquee-running');};
  const start=title=>{
    stop(title);
    const track=title.firstElementChild, distance=track.scrollWidth-title.clientWidth;
    title.classList.toggle('title-overflow',distance>4);
    if(distance<=4 || reduced.matches || document.hidden || !visible.has(title)) return;
    title.style.setProperty('--title-shift',`${-distance-2}px`);
    title.style.setProperty('--title-duration',`${Math.max(8,Math.min(50,distance/22*2+5))}s`);
    timers.set(title,setTimeout(()=>{if(!stopped && visible.has(title) && !document.hidden) title.classList.add('marquee-running');timers.delete(title);},2000));
  };
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting && entry.intersectionRatio>=.75){visible.add(entry.target);start(entry.target);}else{visible.delete(entry.target);stop(entry.target);}}},{threshold:[0,.75]});
  titles.forEach(title=>{title.classList.toggle('title-overflow',title.firstElementChild.scrollWidth-title.clientWidth>4);observer.observe(title);});
  const restart=()=>{for(const title of titles)start(title);};
  const resize=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(restart);};
  const scroll=()=>{container.classList.add('list-scrolling');clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>container.classList.remove('list-scrolling'),180);};
  const visibility=()=>{if(document.hidden)titles.forEach(stop);else restart();};
  const sizeObserver='ResizeObserver' in window?new ResizeObserver(resize):null;
  sizeObserver?.observe(container); window.addEventListener('resize',resize);window.addEventListener('scroll',scroll,{passive:true});document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',restart);
  return ()=>{stopped=true;observer.disconnect();sizeObserver?.disconnect();titles.forEach(stop);clearTimeout(scrollTimer);cancelAnimationFrame(resizeFrame);window.removeEventListener('resize',resize);window.removeEventListener('scroll',scroll);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',restart);};
}
