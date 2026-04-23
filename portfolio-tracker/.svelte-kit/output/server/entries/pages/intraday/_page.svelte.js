import { b as attr_class, d as stringify, c as escape_html, e as ensure_array_like, a as attr, f as derived } from "../../../chunks/renderer.js";
import { p as portfolioStore } from "../../../chunks/portfolio.svelte.js";
import { i as intradayStore, n as normalizeMarketState, a as isExchangeOpen, s as sparklineSVG, g as getTradingMins, E as EU_EXCHANGE_RE } from "../../../chunks/exchange.js";
import "../../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct } from "../../../chunks/fmt.js";
import { P as PrivacyValue } from "../../../chunks/PrivacyValue.js";
import { h as html } from "../../../chunks/html.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const cards = derived(() => () => {
      return portfolioStore.currentTickers.map((ticker) => {
        const meta = portfolioStore.tickerMeta[ticker];
        const yahoo = meta?.["yahoo"] ?? ticker;
        const label = meta?.["label"] ?? ticker;
        const pos = portfolioStore.positions.find((p) => p.ticker === ticker);
        const shares = pos?.shares ?? 0;
        const intra = intradayStore.data[yahoo];
        const prevClose = intra?.previousClose ?? null;
        const pts = intra?.points ?? [];
        const lastPt = pts[pts.length - 1];
        const price = lastPt?.close ?? null;
        const tradingMins = getTradingMins(yahoo);
        const changePct = price != null && prevClose ? (price - prevClose) / prevClose * 100 : null;
        const changeEur = price != null && prevClose && shares ? (price - prevClose) * shares / (EU_EXCHANGE_RE.test(yahoo) ? 1 : intradayStore.liveEurUsd ?? 1.1) : null;
        const rawState = intra?.marketState ?? "";
        const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? "REGULAR" : "CLOSED"));
        const muted = marketState !== "REGULAR";
        const sparkHtml = pts.length >= 2 && prevClose ? sparklineSVG(pts, prevClose, tradingMins, muted) : "";
        return {
          ticker,
          yahoo,
          label,
          shares,
          prevClose,
          price,
          changePct,
          changeEur,
          marketState,
          sparkHtml
        };
      });
    });
    function stateLabel(s) {
      if (s === "REGULAR") return "Open";
      if (s === "PRE") return "Pre";
      if (s === "POST") return "Post";
      return "Gesloten";
    }
    function stateClass(s) {
      if (s === "REGULAR") return "badge-open";
      if (s === "PRE" || s === "POST") return "badge-ext";
      return "badge-closed";
    }
    const totalDayPl = derived(() => cards()().reduce((s, c) => s + (c.changeEur ?? 0), 0));
    const totalValue = derived(() => portfolioStore.positions.reduce((s, p) => s + p.value, 0));
    const totalDayPlPct = derived(() => totalValue() - totalDayPl() > 0 ? totalDayPl() / (totalValue() - totalDayPl()) * 100 : 0);
    $$renderer2.push(`<div class="page-root">`);
    if (intradayStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="day-summary card svelte-1ugfnsv"><div class="day-label svelte-1ugfnsv">Vandaag</div> <div${attr_class(`day-pl ${stringify(totalDayPl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1ugfnsv")}>`);
      PrivacyValue($$renderer2, { value: `${totalDayPl() >= 0 ? "+" : ""}${fmt(totalDayPl())}` });
      $$renderer2.push(`<!----></div> <div${attr_class(`day-pct ${stringify(totalDayPl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1ugfnsv")}>${escape_html(fmtPct(totalDayPlPct()))}</div> `);
      if (intradayStore.liveEurUsd) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="fx-rate svelte-1ugfnsv">EUR/USD ${escape_html(intradayStore.liveEurUsd.toFixed(4))}</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> <div class="spark-grid svelte-1ugfnsv"><!--[-->`);
      const each_array = ensure_array_like(cards()());
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let card = each_array[$$index];
        $$renderer2.push(`<a class="spark-card card svelte-1ugfnsv"${attr("href", `/stock/${stringify(card.ticker)}`)}><div class="spark-header svelte-1ugfnsv"><div class="spark-ticker svelte-1ugfnsv">${escape_html(card.ticker)}</div> <span${attr_class(`badge ${stringify(stateClass(card.marketState))}`, "svelte-1ugfnsv")}>${escape_html(stateLabel(card.marketState))}</span></div> `);
        if (card.label !== card.ticker) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="spark-label svelte-1ugfnsv">${escape_html(card.label)}</div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <div class="spark-price svelte-1ugfnsv">`);
        if (card.price != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="price-val svelte-1ugfnsv">${escape_html(card.price.toFixed(2))}</span> `);
          if (card.changePct != null) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span${attr_class(`price-chg ${stringify(card.changePct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1ugfnsv")}>${escape_html(card.changePct >= 0 ? "+" : "")}${escape_html(card.changePct.toFixed(2))}%</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="c-muted svelte-1ugfnsv">—</span>`);
        }
        $$renderer2.push(`<!--]--></div> `);
        if (card.changeEur != null && card.shares) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div${attr_class(`spark-eur ${stringify(card.changeEur >= 0 ? "c-pos" : "c-neg")}`, "svelte-1ugfnsv")}>`);
          PrivacyValue($$renderer2, {
            value: `${card.changeEur >= 0 ? "+" : ""}${fmt(card.changeEur)}`
          });
          $$renderer2.push(`<!----></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> ${html(card.sparkHtml)}</a>`);
      }
      $$renderer2.push(`<!--]--></div> `);
      if (portfolioStore.watchlistData.length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div style="margin-top:20px"><h3 style="font-size:13px;font-weight:600;margin:0 0 10px">Watchlist</h3> <div class="spark-grid svelte-1ugfnsv"><!--[-->`);
        const each_array_1 = ensure_array_like(portfolioStore.watchlistData);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let w = each_array_1[$$index_1];
          const intra = intradayStore.data[w.yahoo];
          const pts = intra?.points ?? [];
          const prev = intra?.previousClose ?? null;
          const last = pts[pts.length - 1];
          const price = last?.close ?? null;
          const pct = price != null && prev ? (price - prev) / prev * 100 : null;
          const rawState = intra?.marketState ?? "";
          const state = normalizeMarketState(w.yahoo, rawState || (isExchangeOpen(w.yahoo) ? "REGULAR" : "CLOSED"));
          $$renderer2.push(`<div class="spark-card card svelte-1ugfnsv"><div class="spark-header svelte-1ugfnsv"><div class="spark-ticker svelte-1ugfnsv">${escape_html(w.ticker)}</div> <span${attr_class(`badge ${stringify(stateClass(state))}`, "svelte-1ugfnsv")}>${escape_html(stateLabel(state))}</span></div> `);
          if (w.label && w.label !== w.ticker) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<div class="spark-label svelte-1ugfnsv">${escape_html(w.label)}</div>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--> <div class="spark-price svelte-1ugfnsv">`);
          if (price != null) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="price-val svelte-1ugfnsv">${escape_html(price.toFixed(2))}</span> `);
            if (pct != null) {
              $$renderer2.push("<!--[0-->");
              $$renderer2.push(`<span${attr_class(`price-chg ${stringify(pct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1ugfnsv")}>${escape_html(pct >= 0 ? "+" : "")}${escape_html(pct.toFixed(2))}%</span>`);
            } else {
              $$renderer2.push("<!--[-1-->");
            }
            $$renderer2.push(`<!--]-->`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="c-muted svelte-1ugfnsv">—</span>`);
          }
          $$renderer2.push(`<!--]--></div> `);
          if (pts.length >= 2 && prev) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`${html(sparklineSVG(pts, prev, getTradingMins(w.yahoo), state !== "REGULAR"))}`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="loading-state svelte-1ugfnsv">Intraday data laden…</div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
