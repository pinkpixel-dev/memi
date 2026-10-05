import { h } from "./dom.js";
import { icon } from "./icons.js";

const fmt = new Intl.NumberFormat("en");
export const num = (n) => fmt.format(n);

/**
 * Horizontal bars, one per row, longest first. Each row is a button.
 * rows: [{ key, label, icon?, count }]. value(row, total) gives the text on the right.
 */
export function barList(rows, { onPick, value = (r) => num(r.count), limit = 8, noun = "rows", pickLabel = (r) => `Show ${r.label}` }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const wrap = h("div", { class: "bars" });
  let expanded = false;

  const row = (r) => {
    const fill = h("span", { class: "bar-fill" });
    fill.style.setProperty("--v", String(r.count / max));
    return h(
      "li",
      {},
      h(
        "button",
        { class: "bar-row", type: "button", "data-key": `bar-${r.key}`, title: pickLabel(r), onclick: () => onPick(r) },
        h("span", { class: "bar-label" }, r.icon ? icon(r.icon, 14) : null, h("span", { class: "bar-text" }, r.label)),
        h("span", { class: "bar-track", "aria-hidden": "true" }, fill),
        h("span", { class: "bar-value" }, value(r, total)),
      ),
    );
  };

  const render = () => {
    const shown = expanded ? rows : rows.slice(0, limit);
    wrap.replaceChildren(h("ul", { class: "bar-list" }, ...shown.map(row)));
    if (rows.length > limit) {
      wrap.append(
        h(
          "button",
          { class: "btn see-all", type: "button", "aria-expanded": String(expanded), onclick: () => ((expanded = !expanded), render(), wrap.querySelector(".see-all").focus()) },
          expanded ? "Show fewer" : `See all ${rows.length} ${noun}`,
          icon("chevron-down", 16),
        ),
      );
    }
  };
  render();
  return wrap;
}

const hourFmt = new Intl.DateTimeFormat("en", { hour: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function label(iso, bucket, long = false) {
  const d = new Date(iso);
  if (bucket === "hour") return long ? `${dayFmt.format(d)}, ${hourFmt.format(d)}` : hourFmt.format(d);
  return bucket === "week" ? `Week of ${dayFmt.format(d)}` : dayFmt.format(d);
}

/**
 * Vertical bars over time for one series. Hover or arrow keys show the value of a bar.
 * buckets: [{ start, [key]: number }], bucket: "hour" | "day" | "week".
 */
export function activityChart(buckets, { key, bucket, noun, title }) {
  const values = buckets.map((b) => b[key]);
  const max = Math.max(0, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return h("p", { class: "chart-empty" }, `No ${noun} in this range yet.`);

  const peak = values.indexOf(max);
  const tip = h("div", { class: "chart-tip", "aria-live": "polite", hidden: true });
  const cols = buckets.map((b, i) => {
    const bar = h("span", { class: "chart-bar" });
    bar.style.setProperty("--v", String(b[key] / max));
    if (b[key]) bar.classList.add("some");
    return h("span", { class: "chart-col", "data-i": i }, bar);
  });
  const plot = h("div", { class: "chart-plot" }, ...cols);
  const chart = h(
    "div",
    {
      class: "chart",
      tabindex: 0,
      role: "group",
      "aria-label": `${title}: ${num(total)} total, most on ${label(buckets[peak].start, bucket, true)} (${num(max)}). Use the arrow keys to read each bar.`,
    },
    h("div", { class: "chart-y", "aria-hidden": "true" }, h("span", {}, num(max)), h("span", {}, "0")),
    plot,
    h(
      "div",
      { class: "chart-x", "aria-hidden": "true" },
      h("span", {}, label(buckets[0].start, bucket)),
      buckets.length > 2 ? h("span", {}, label(buckets[Math.floor((buckets.length - 1) / 2)].start, bucket)) : null,
      h("span", {}, label(buckets.at(-1).start, bucket)),
    ),
    tip,
  );

  let active = -1;
  const show = (i) => {
    cols[active]?.classList.remove("active");
    active = Math.max(0, Math.min(buckets.length - 1, i));
    const col = cols[active];
    col.classList.add("active");
    const n = values[active];
    tip.textContent = `${label(buckets[active].start, bucket, true)}: ${num(n)} ${noun}`;
    tip.hidden = false;
    // Columns are positioned against the chart. Keep the tip inside it at the edges.
    const half = tip.offsetWidth / 2;
    const x = col.offsetLeft + col.offsetWidth / 2;
    tip.style.setProperty("--x", `${Math.max(half, Math.min(chart.clientWidth - half, x))}px`);
  };
  const hide = () => {
    cols[active]?.classList.remove("active");
    active = -1;
    tip.hidden = true;
  };

  plot.addEventListener("pointermove", (e) => {
    const col = e.target.closest?.(".chart-col");
    if (col && Number(col.dataset.i) !== active) show(Number(col.dataset.i));
  });
  plot.addEventListener("pointerleave", () => document.activeElement !== chart && hide());
  chart.addEventListener("focus", () => show(peak));
  chart.addEventListener("blur", hide);
  chart.addEventListener("keydown", (e) => {
    const moves = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: buckets.length - 1 };
    if (e.key in moves) (e.preventDefault(), show(moves[e.key]));
  });
  return chart;
}
