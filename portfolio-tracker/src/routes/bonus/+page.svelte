<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { saveBonus, deleteBonus } from '$lib/api/bonus';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { BonusItem, BonusType } from '$lib/types/bonus';

  let showDialog  = $state(false);
  let editItem    = $state<BonusItem | null>(null);
  let saving      = $state(false);
  let saveMsg     = $state('');

  // Form fields
  let fType       = $state<BonusType>('warrant');
  let fLabel      = $state('');
  let fUnderlying = $state('^STOXX50E');
  let fQty        = $state('');
  let fGrantPrice = $state('10');
  let fExpiry     = $state('');
  let fStrike     = $state('');
  let fMultiplier = $state('1');

  function openAdd() {
    editItem    = null;
    fType       = 'warrant';
    fLabel      = '';
    fUnderlying = '^STOXX50E';
    fQty        = '';
    fGrantPrice = '10';
    fExpiry     = '';
    fStrike     = '';
    fMultiplier = '1';
    showDialog  = true;
  }

  function openEdit(item: BonusItem) {
    editItem    = item;
    fType       = item.type;
    fLabel      = item.label;
    fUnderlying = item.underlying;
    fQty        = String(item.quantity);
    fGrantPrice = String(item.grantPrice);
    fExpiry     = item.expiry ?? '';
    fStrike     = String(item.strike ?? '');
    fMultiplier = String(item.multiplier ?? 1);
    showDialog  = true;
  }

  async function save() {
    saving  = true;
    saveMsg = '';
    try {
      const entry: Partial<BonusItem> = {
        id: editItem?.id,
        type: fType,
        label: fLabel,
        underlying: fUnderlying,
        quantity: parseInt(fQty) || 0,
        grantPrice: parseFloat(fGrantPrice) || 0,
        expiry: fExpiry || undefined,
        strike: parseFloat(fStrike) || undefined,
        multiplier: parseFloat(fMultiplier) || 1,
      };
      const saved = await saveBonus(entry);
      if (editItem) {
        portfolioStore.bonusItems = portfolioStore.bonusItems.map((b) => b.id === saved.id ? saved : b);
      } else {
        portfolioStore.bonusItems = [...portfolioStore.bonusItems, saved];
      }
      showDialog = false;
      saveMsg    = 'Opgeslagen!';
      setTimeout(() => { saveMsg = ''; }, 2000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      saving = false;
    }
  }

  async function remove(id: string) {
    if (!confirm('Bonus verwijderen?')) return;
    await deleteBonus(id);
    portfolioStore.bonusItems = portfolioStore.bonusItems.filter((b) => b.id !== id);
    showDialog = false;
  }

  function typeLabel(t: BonusType) {
    return t === 'call_option' ? 'Call optie' : 'Warrant';
  }
</script>

<div class="page-root">
  <div class="page-toolbar">
    <h2 class="page-title">Bonus & opties</h2>
    <button class="btn" onclick={openAdd}>+ Toevoegen</button>
    {#if saveMsg}
      <span class="save-msg" class:c-neg={saveMsg.includes('mislukt')}>{saveMsg}</span>
    {/if}
  </div>

  {#if portfolioStore.bonusItems.length === 0}
    <div class="card empty-state">
      <p>Geen bonus-instrumenten gevonden.</p>
      <p class="c-muted" style="font-size:12px">Voeg warrants of call-opties toe om ze hier te beheren.</p>
    </div>
  {:else}
    <div class="bonus-grid">
      {#each portfolioStore.bonusItems as item}
        <a class="bonus-card card" href="/bonus/{item.id}">
          <div class="bonus-card-header">
            <div class="bonus-card-title">{item.label}</div>
            <span class="type-badge" class:call={item.type === 'call_option'}>{typeLabel(item.type)}</span>
          </div>
          <div class="bonus-card-sub">{item.underlying}</div>

          <div class="bonus-metrics">
            <div class="bonus-metric">
              <div class="bm-label">Waarde</div>
              <div class="bm-value">
                {#if item.totalValue != null}
                  <PrivacyValue value={fmt(item.totalValue)} />
                {:else}
                  <span class="c-muted">—</span>
                {/if}
              </div>
            </div>
            <div class="bonus-metric">
              <div class="bm-label">P&amp;L</div>
              <div class="bm-value {(item.pl ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
                {#if item.pl != null}
                  <PrivacyValue value={`${item.pl >= 0 ? '+' : ''}${fmt(item.pl)}`} />
                {:else}
                  <span class="c-muted">—</span>
                {/if}
              </div>
            </div>
            <div class="bonus-metric">
              <div class="bm-label">%</div>
              <div class="bm-value {(item.plPct ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
                {item.plPct != null ? fmtPct(item.plPct) : '—'}
              </div>
            </div>
            {#if item.type === 'call_option' && item.delta != null}
              <div class="bonus-metric">
                <div class="bm-label">Delta</div>
                <div class="bm-value">{item.delta.toFixed(3)}</div>
              </div>
            {/if}
          </div>

          <div class="bonus-footer">
            <span class="c-muted" style="font-size:11px">
              {item.quantity} × {item.type === 'call_option' ? `Strike ${item.strike}` : `@${item.grantPrice}`}
            </span>
            {#if item.expiry}
              <span class="c-muted" style="font-size:11px">Verloopt {item.expiry}</span>
            {/if}
            <button
              class="edit-btn"
              onclick={(e) => { e.preventDefault(); openEdit(item); }}
              title="Bewerken"
            >
              ✏
            </button>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- Edit dialog -->
{#if showDialog}
  <div class="dialog-backdrop" onclick={() => (showDialog = false)} role="presentation"></div>
  <div class="dialog-panel" role="dialog" aria-modal="true">
    <div class="dialog-header">
      <span class="dialog-title">{editItem ? 'Bonus bewerken' : 'Bonus toevoegen'}</span>
      <button class="dialog-close" onclick={() => (showDialog = false)}>✕</button>
    </div>

    <div class="dialog-body">
      <!-- Type toggle -->
      <div class="form-group">
        <label class="form-label">Type</label>
        <div class="seg">
          <button class="seg-btn" class:on={fType === 'warrant'} onclick={() => (fType = 'warrant')}>Warrant</button>
          <button class="seg-btn" class:on={fType === 'call_option'} onclick={() => (fType = 'call_option')}>Call optie</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Naam</label>
        <input class="form-input" type="text" bind:value={fLabel} placeholder="Warrants EuroStoxx" />
      </div>
      <div class="form-group">
        <label class="form-label">Onderliggende (Yahoo)</label>
        <input class="form-input" type="text" bind:value={fUnderlying} placeholder="^STOXX50E" />
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label">Aantal</label>
          <input class="form-input" type="number" bind:value={fQty} placeholder="250" step="1" min="1" />
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Prijs bij toekenning</label>
          <input class="form-input" type="number" bind:value={fGrantPrice} placeholder="10" step="0.01" />
        </div>
      </div>
      {#if fType === 'call_option'}
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Strike</label>
            <input class="form-input" type="number" bind:value={fStrike} placeholder="45.00" step="0.01" />
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">Multiplier</label>
            <input class="form-input" type="number" bind:value={fMultiplier} placeholder="1" step="0.01" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Vervaldatum</label>
          <input class="form-input" type="date" bind:value={fExpiry} />
        </div>
      {/if}
    </div>

    <div class="dialog-footer">
      {#if editItem}
        <button class="btn" style="margin-right:auto;color:#ef4444" onclick={() => remove(editItem!.id)}>
          Verwijderen
        </button>
      {/if}
      <button class="btn" onclick={() => (showDialog = false)}>Annuleren</button>
      <button class="btn success" disabled={saving} onclick={save}>
        {saving ? 'Opslaan…' : 'Opslaan'}
      </button>
    </div>
    {#if saveMsg}
      <div class="dialog-msg" class:c-neg={saveMsg.includes('mislukt')}>{saveMsg}</div>
    {/if}
  </div>
{/if}

<style>
  .page-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .page-title { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
  .save-msg { font-size: 12px; color: var(--c-pos, #16a34a); }

  .empty-state { padding: 32px; text-align: center; }
  .empty-state p { margin: 0 0 8px; font-size: 14px; }

  .bonus-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .bonus-card { padding: 14px 16px; text-decoration: none; color: inherit; display: block; }
  .bonus-card:hover { border-color: var(--fg-muted); }
  .bonus-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .bonus-card-title { font-size: 14px; font-weight: 600; }
  .bonus-card-sub { font-size: 12px; color: var(--fg-muted); margin-top: 2px; }

  .type-badge {
    font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
    text-transform: uppercase; padding: 2px 6px; border-radius: 3px;
    background: rgba(100,116,139,0.15); color: #64748b; flex-shrink: 0;
  }
  .type-badge.call { background: rgba(167,139,250,0.15); color: #a78bfa; }

  .bonus-metrics {
    display: flex;
    gap: 16px;
    margin: 12px 0 8px;
    flex-wrap: wrap;
  }
  .bonus-metric { display: flex; flex-direction: column; gap: 1px; }
  .bm-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted); }
  .bm-value { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }

  .bonus-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: 8px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    flex-wrap: wrap;
  }
  .edit-btn {
    background: none; border: none; cursor: pointer; padding: 2px 6px;
    color: var(--fg-muted); font-size: 13px; border-radius: 4px;
  }
  .edit-btn:hover { background: var(--border); color: var(--fg); }

  /* Dialog */
  .dialog-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 100;
  }
  .dialog-panel {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: min(400px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    box-shadow: 0 16px 48px rgba(0,0,0,0.3);
  }
  .dialog-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
  }
  .dialog-title { font-size: 15px; font-weight: 700; }
  .dialog-close { background: none; border: none; cursor: pointer; color: var(--fg-muted); font-size: 18px; padding: 0; }
  .dialog-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
  .dialog-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
  .dialog-msg { padding: 8px 20px 14px; font-size: 12px; }

  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted); }
  .form-input {
    background: var(--input-bg, var(--card-bg));
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 10px;
    color: var(--fg);
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
  }
  .form-input:focus { outline: none; border-color: #818cf8; }
  .form-row { display: flex; gap: 10px; }
</style>
