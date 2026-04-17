/**
 * portfolio-tracker-card — Lovelace card for the Portfolio Tracker HA addon
 *
 * Install as a Lovelace resource (Settings → Dashboards → Resources):
 *   URL:  /local/portfolio-tracker/portfolio-card.js
 *   Type: JavaScript module
 *
 * Card YAML:
 *   type:  custom:portfolio-tracker-card
 *   title: Portfolio        # optional, default "Portfolio"
 *   days:  30               # optional, history window in days, default 30
 */

class PortfolioTrackerCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    this._scheduleRender();
  }

  setConfig(config) {
    this._config = { title: 'Portfolio', days: 30, ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._scheduleRender();
  }

  // Throttle: hass fires on every state change; debounce to one render per frame
  _scheduleRender() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this._render();
    });
  }

  // Fetch history from HA recorder; cached for 5 minutes
  async _loadHistory() {
    if (!this._hass) return [];
    const now = Date.now();
    if (this._histTs && now - this._histTs < 300_000) return this._hist ?? [];

    const start = new Date(now - this._config.days * 86_400_000).toISOString();
    try {
      const data = await this._hass.callApi(
        'GET',
        `history/period/${start}?filter_entity_id=sensor.portfolio_value` +
        `&minimal_response=true&no_attributes=true`,
      );
      this._hist  = (data?.[0] ?? [])
        .filter(s => s.state !== 'unavailable' && s.state !== 'unknown')
        .map(s => Number.parseFloat(s.state))
        .filter(v => !Number.isNaN(v));
      this._histTs = now;
    } catch {
      this._hist = [];
    }
    return this._hist;
  }

  _sparklineSvg(values, w = 260, h = 44) {
    if (values.length < 2) return '';
    const min   = Math.min(...values);
    const max   = Math.max(...values);
    const range = max - min || 1;
    const pts   = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = values.at(-1) >= values[0] ? '#10b981' : '#ef4444';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"
        width="${w}" height="${h}" style="display:block;margin-top:10px;overflow:visible">
      <polyline points="${pts}"
        fill="none" stroke="${color}" stroke-width="1.5"
        stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  _readSensors() {
    const st = id => this._hass.states[id];
    const val = st('sensor.portfolio_value');
    if (!val || val.state === 'unavailable' || val.state === 'unknown') return null;

    const pl     = st('sensor.portfolio_pl');
    const plPct  = st('sensor.portfolio_pl_pct');
    const day    = st('sensor.portfolio_daily_pl');
    const dayPct = st('sensor.portfolio_daily_pl_pct');
    const health = st('sensor.portfolio_health');

    return {
      totalVal:   Number.parseFloat(val.state),
      totalPl:    Number.parseFloat(pl?.state    ?? 0),
      plPctVal:   Number.parseFloat(plPct?.state ?? 0),
      dailyPl:    day?.state    === 'unavailable' ? null : Number.parseFloat(day?.state    ?? 0),
      dailyPlPct: dayPct?.state === 'unavailable' ? null : Number.parseFloat(dayPct?.state ?? 0),
      healthVal:  health ? Number.parseInt(health.state, 10) : null,
      ddPct:      Number.parseFloat(val.attributes?.drawdown_pct ?? 0),
      nyseOn:     st('binary_sensor.portfolio_nyse_open')?.state    === 'on',
      euOn:       st('binary_sensor.portfolio_eu_markets_open')?.state === 'on',
      ddWarnOn:   st('binary_sensor.portfolio_drawdown_warning')?.state === 'on',
      targetOn:   st('binary_sensor.portfolio_target_hit')?.state === 'on',
    };
  }

  _buildDailyHtml(dailyBig, dailySub, dailyColor) {
    if (dailyBig === null) return '';
    const subSpan = dailySub === null ? '' : ` <span class="sub">(${dailySub})</span>`;
    return `<span class="stat" style="color:${dailyColor}">${dailyBig}${subSpan} <span class="sub">vandaag</span></span>`;
  }

  async _render() {
    if (!this._hass || !this.shadowRoot) return;

    const s = this._readSensors();
    if (!s) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding:16px;font-size:13px;color:var(--secondary-text-color)">
            Portfolio Tracker — geen data<br>
            <small>Controleer of de addon actief is en transacties geladen zijn.</small>
          </div>
        </ha-card>`;
      return;
    }

    const { totalVal, totalPl, plPctVal, dailyPl, dailyPlPct, healthVal, ddPct, nyseOn, euOn, ddWarnOn, targetOn } = s;

    const eur = v => new Intl.NumberFormat('nl-NL', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
    const sign    = v => (v >= 0 ? '+' : '') + eur(v);
    const signPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

    const plColor    = totalPl >= 0        ? '#10b981' : '#ef4444';
    const dailyColor = (dailyPl ?? 0) >= 0 ? '#10b981' : '#ef4444';
    let healthColor = '#ef4444';
    if (healthVal >= 80) healthColor = '#10b981';
    else if (healthVal >= 50) healthColor = '#f59e0b';

    const dot = on => `<span style="
        display:inline-block;width:7px;height:7px;border-radius:50%;
        background:${on ? '#10b981' : '#6b7280'};margin-right:3px;vertical-align:middle">
      </span>`;

    let dailyBig = null;
    if (dailyPlPct !== null) dailyBig = signPct(dailyPlPct);
    else if (dailyPl !== null) dailyBig = sign(dailyPl);
    const dailySub = dailyPlPct !== null && dailyPl !== null ? sign(dailyPl) : null;

    const history    = await this._loadHistory();
    const sparkline  = this._sparklineSvg(history);
    const dailyHtml  = this._buildDailyHtml(dailyBig, dailySub, dailyColor);
    const healthHtml = healthVal === null
      ? ''
      : `&thinsp;<span style="color:${healthColor};font-size:10px">● ${healthVal}</span>`;

    const alerts = [
      ddWarnOn ? `⚠ Drawdown ${ddPct.toFixed(1)}%` : null,
      targetOn ? `✓ Doelwaarde bereikt`             : null,
    ].filter(Boolean);

    this.shadowRoot.innerHTML = `
      <style>
        :host  { display:block }
        ha-card { padding:16px 16px 12px }
        .top   { display:flex; justify-content:space-between; align-items:center; margin-bottom:2px }
        .title { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em;
                 color:var(--secondary-text-color) }
        .mkts  { font-size:11px; color:var(--secondary-text-color); user-select:none }
        .val   { font-size:30px; font-weight:700; color:var(--primary-text-color); line-height:1.15; margin:4px 0 2px }
        .row   { display:flex; gap:12px; flex-wrap:wrap; align-items:baseline }
        .stat  { font-size:16px; font-weight:600 }
        .sub   { font-size:11px; font-weight:400; color:var(--secondary-text-color) }
        .total { font-size:12px; color:var(--secondary-text-color); margin-top:2px }
        .alert { font-size:11px; margin-top:6px; color:#f59e0b }
      </style>
      <ha-card>
        <div class="top">
          <span class="title">${this._config.title}</span>
          <span class="mkts">
            ${dot(nyseOn)}NYSE
            &thinsp;${dot(euOn)}EU
            ${healthHtml}
          </span>
        </div>
        <div class="val">${eur(totalVal)}</div>
        <div class="row">${dailyHtml}</div>
        <div class="total" style="color:${plColor}">${sign(totalPl)} (${signPct(plPctVal)}) totaal</div>
        ${alerts.map(a => `<div class="alert">${a}</div>`).join('')}
        ${sparkline}
      </ha-card>`;
  }

  static getStubConfig() { return { title: 'Portfolio', days: 30 }; }
}

customElements.define('portfolio-tracker-card', PortfolioTrackerCard);
