import { e } from "./model.mjs";

const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  filter: '<path d="M4 7h16M4 17h16M9 4v6M15 14v6"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  music:
    '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="5.5" cy="18" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="16" rx="3.5" ry="2.5"/>',
  export: '<path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6"/>',
  import: '<path d="M12 3v13m-4-4 4 4 4-4M4 14v6h16v-6"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? ""}</svg>`;
export const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleString("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "まだありません";
export const badge = (category) =>
  category
    ? `<span class="badge color-${category.color}">${e(category.label)}</span>`
    : '<span class="badge color-gray">未設定</span>';
export const options = (items, selected, blank = "未設定") =>
  `<option value="">${e(blank)}</option>` +
  items
    .map((item) => {
      const value = typeof item === "string" ? item : item.id;
      const label = typeof item === "string" ? item : item.label;
      return html`<option value="${e(value)}" ${value === selected ? " selected" : ""}>
        ${e(label)}
      </option>`;
    })
    .join("");
export const back = (target = "/", label = "楽曲一覧へ") =>
  `<button class="back-button" data-go="${e(target)}">${icon("back")}${e(label)}</button>`;
export const title = (eyebrow, heading, side = "") =>
  `<div class="page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1>${heading}</h1></div>${side}</div>`;
export const hexColor = (values) =>
  "#" + values.map((value) => value.toString(16).padStart(2, "0")).join("");

// A standard template literal with an HTML tag lets the formatter indent markup.
// Callers escape untrusted values with e(), just as with ordinary templates.
export function html(parts, ...values) {
  return parts.reduce(
    (result, part, index) => result + (index ? values[index - 1] : "") + part,
    "",
  );
}
