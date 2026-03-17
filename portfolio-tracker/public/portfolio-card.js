/**
 * portfolio-tracker-card — Lovelace card for the Portfolio Tracker HA addon
 *
 * Install as a Lovelace resource (Settings → Dashboards → Resources):
 *   URL:  /api/hassio_ingress/portfolio_tracker/portfolio-card.js
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

  async _render() {
    if (!this._hass || !this.shadowRoot) return;

    const st = id => this._hass.states[id];
    const val = st('sensor.portfolio_value');

    if (!val || val.state === 'unavailable' || val.state === 'unknown') {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding:16px;font-size:13px;color:var(--secondary-text-color)">
            Portfolio Tracker — geen data<br>
            <small>Controleer of de addon actief is en transacties geladen zijn.</small>
          </div>
        </ha-card>`;
      return;
    }

    const pl      = st('sensor.portfolio_pl');
    const plPct   = st('sensor.portfolio_pl_pct');
    const day     = st('sensor.portfolio_daily_pl');
    const nyse    = st('binary_sensor.portfolio_nyse_open');
    const xetra   = st('binary_sensor.portfolio_xetra_open');
    const ddWarn  = st('binary_sensor.portfolio_drawdown_warning');
    const target  = st('binary_sensor.portfolio_target_hit');

    const totalVal  = Number.parseFloat(val.state);
    const totalPl   = Number.parseFloat(pl?.state   ?? 0);
    const plPctVal  = Number.parseFloat(plPct?.state ?? 0);
    const dailyPl   = day?.state === 'unavailable' ? null : Number.parseFloat(day?.state ?? 0);
    const ddPct     = Number.parseFloat(val.attributes?.drawdown_pct ?? 0);

    const eur = v => new Intl.NumberFormat('nl-NL', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
    const sign    = v => (v >= 0 ? '+' : '') + eur(v);
    const signPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

    const plColor    = totalPl >= 0  ? '#10b981' : '#ef4444';
    const dailyColor = (dailyPl ?? 0) >= 0 ? '#10b981' : '#ef4444';

    const dot = on => `<span style="
        display:inline-block;width:7px;height:7px;border-radius:50%;
        background:${on ? '#10b981' : '#6b7280'};margin-right:3px;vertical-align:middle">
      </span>`;

    const history   = await this._loadHistory();
    const sparkline = this._sparklineSvg(history);

    const alerts = [
      ddWarn?.state  === 'on' ? `⚠ Drawdown ${ddPct.toFixed(1)}%` : null,
      target?.state  === 'on' ? `✓ Doelwaarde bereikt`            : null,
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
        .row   { display:flex; gap:12px; flex-wrap:wrap }
        .stat  { font-size:13px; font-weight:500 }
        .alert { font-size:11px; margin-top:6px; color:#f59e0b }
      </style>
      <ha-card>
        <div class="top">
          <span class="title">${this._config.title}</span>
          <span class="mkts">
            ${dot(nyse?.state  === 'on')}NYSE
            &thinsp;${dot(xetra?.state === 'on')}XETRA
          </span>
        </div>
        <div class="val">${eur(totalVal)}</div>
        <div class="row">
          <span class="stat" style="color:${plColor}">
            ${sign(totalPl)} (${signPct(plPctVal)})
          </span>
          ${dailyPl !== null
            ? `<span class="stat" style="color:${dailyColor}">Vandaag ${sign(dailyPl)}</span>`
            : ''}
        </div>
        ${alerts.map(a => `<div class="alert">${a}</div>`).join('')}
        ${sparkline}
      </ha-card>`;
  }

  static getStubConfig() { return { title: 'Portfolio', days: 30 }; }
}

customElements.define('portfolio-tracker-card', PortfolioTrackerCard);
