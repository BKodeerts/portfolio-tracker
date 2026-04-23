import { e as escape_html, c as attr_class, a as attr, b as ensure_array_like, d as derived } from "../../../chunks/renderer.js";
import { p as portfolioStore } from "../../../chunks/portfolio.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let dragOver = false;
    let saveMode = "merge";
    let saving = false;
    let rows = [];
    const tickerGroups = derived(() => () => {
      const map = {};
      for (const tx of portfolioStore.rawTransactions) {
        if (!map[tx.ticker]) map[tx.ticker] = {
          yahoo: tx.yahoo ?? tx.ticker,
          label: tx.label ?? "",
          count: 0
        };
        map[tx.ticker].count++;
      }
      return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    });
    let renameEdits = {};
    let renameSaving = false;
    const txCount = derived(() => portfolioStore.rawTransactions.length);
    const dateRange = derived(() => txCount() > 0 ? `${portfolioStore.rawTransactions[0]?.date ?? ""} → ${portfolioStore.rawTransactions[txCount() - 1]?.date ?? ""}` : "—");
    $$renderer2.push(`<div class="page-root"><div class="import-info card svelte-1kumcmu"><strong>${escape_html(txCount())} transacties opgeslagen</strong>${escape_html(txCount() > 0 ? ` · ${dateRange()}` : "")}<br/> Upload een DeGiro <em>Transacties.csv</em> of Bolero <em>portfolio_…xlsx</em>. Bestaande data kun je behouden of vervangen.</div> <div${attr_class("drop-zone svelte-1kumcmu", void 0, { "drag-over": dragOver })} role="button" tabindex="0">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<strong>Sleep bestand hierheen</strong> <p class="c-muted svelte-1kumcmu" style="margin:4px 0 0">of klik om te bladeren (.csv, .xlsx)</p>`);
    }
    $$renderer2.push(`<!--]--></div> <input id="csv-input" type="file" accept=".csv,.xlsx,text/csv,text/plain" style="display:none"/> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (rows.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card" style="margin-top:16px;overflow-x:auto"><div class="map-header svelte-1kumcmu"><span style="font-size:13px;font-weight:600">${escape_html(rows.length)} rijen gevonden</span> <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">`);
      $$renderer2.select({ class: "mobile-select", value: saveMode }, ($$renderer3) => {
        $$renderer3.option({ value: "merge" }, ($$renderer4) => {
          $$renderer4.push(`Samenvoegen`);
        });
        $$renderer3.option({ value: "replace" }, ($$renderer4) => {
          $$renderer4.push(`Vervangen`);
        });
      });
      $$renderer2.push(` <button class="btn success"${attr("disabled", saving, true)}>${escape_html("Importeren")}</button> <button class="btn">Annuleren</button> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div></div> <table class="map-table svelte-1kumcmu"><thead><tr><th class="svelte-1kumcmu">ISIN</th><th class="svelte-1kumcmu">Product</th><th class="svelte-1kumcmu">Ticker</th><th class="svelte-1kumcmu">Yahoo</th><th class="right svelte-1kumcmu">Aandelen</th><th class="right svelte-1kumcmu">Kosten €</th><th class="svelte-1kumcmu">Datum</th></tr></thead><tbody class="svelte-1kumcmu"><!--[-->`);
      const each_array = ensure_array_like(rows);
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let row = each_array[i];
        $$renderer2.push(`<tr class="svelte-1kumcmu"><td class="mono svelte-1kumcmu" style="font-size:11px">${escape_html(row.isin)}</td><td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="svelte-1kumcmu">${escape_html(row.product)}</td><td class="svelte-1kumcmu"><input class="map-input svelte-1kumcmu"${attr("value", row.ticker)} style="width:80px;text-transform:uppercase"/></td><td class="svelte-1kumcmu"><input class="map-input svelte-1kumcmu"${attr("value", row.yahoo)} style="width:100px"/></td><td class="right mono svelte-1kumcmu">${escape_html(row.shares)}</td><td class="right mono svelte-1kumcmu">€${escape_html(Math.round(row.costEur).toLocaleString("nl-BE"))}</td><td class="mono svelte-1kumcmu" style="font-size:11px">${escape_html(row.date)}</td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (txCount() > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card" style="margin-top:20px;padding:16px"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px">Tickers hernoemen</h3> <p class="c-muted svelte-1kumcmu" style="font-size:12px;margin-bottom:12px;line-height:1.5">Wijzig ticker of Yahoo-symbool. Wordt toegepast op alle bijbehorende transacties.</p> <div style="overflow-x:auto"><table class="map-table svelte-1kumcmu"><thead><tr><th class="svelte-1kumcmu">Ticker</th><th class="svelte-1kumcmu">Yahoo symbool</th><th class="svelte-1kumcmu">Label</th><th class="right svelte-1kumcmu">#</th></tr></thead><tbody class="svelte-1kumcmu"><!--[-->`);
      const each_array_1 = ensure_array_like(tickerGroups()());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let [origTicker, info] = each_array_1[$$index_1];
        $$renderer2.push(`<tr class="svelte-1kumcmu"><td class="svelte-1kumcmu"><input class="map-input svelte-1kumcmu"${attr("value", renameEdits[origTicker]?.ticker ?? origTicker)} style="width:80px;font-family:'JetBrains Mono',monospace;text-transform:uppercase"/></td><td class="svelte-1kumcmu"><input class="map-input svelte-1kumcmu"${attr("value", renameEdits[origTicker]?.yahoo ?? info.yahoo)} style="width:110px"/></td><td style="font-size:11px;color:var(--fg-muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="svelte-1kumcmu">${escape_html(info.label)}</td><td class="right mono svelte-1kumcmu" style="font-size:11px">${escape_html(info.count)}</td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div> <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="btn success"${attr("disabled", renameSaving, true)}>${escape_html("Tickers opslaan")}</button> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
