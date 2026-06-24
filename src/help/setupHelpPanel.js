import { HELP_SECTIONS } from './parameterHelp.js';
import { runControlAudit, summarizeAudit } from './controlAudit.js';

const STATUS_LABEL = {
  ok: 'OK',
  conditional: 'Conditional',
  'needs-audio': 'Needs audio',
  missing: 'Missing',
  unwired: 'Not wired',
  readonly: 'Read-only',
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHelpContent() {
  return HELP_SECTIONS.map((section) => `
    <details class="help-section" open>
      <summary class="help-section-title">${escapeHtml(section.title)}</summary>
      <dl class="help-dl">
        ${section.items.map((item) => `
          <div class="help-item">
            <dt>${escapeHtml(item.name)}</dt>
            <dd>${escapeHtml(item.desc)}${item.when ? ` <span class="help-when">(${escapeHtml(item.when)})</span>` : ''}</dd>
          </div>
        `).join('')}
      </dl>
    </details>
  `).join('');
}

function renderAuditReport(results) {
  const summary = summarizeAudit(results);
  const summaryLine = `OK ${summary.ok} · Conditional ${summary.conditional} · Needs audio ${summary['needs-audio']} · Not wired ${summary.unwired} · Missing ${summary.missing}`;

  const rows = results.map((r) => `
    <tr class="help-audit-row help-audit-${r.status}">
      <td><span class="help-audit-badge">${STATUS_LABEL[r.status] ?? r.status}</span></td>
      <td>${escapeHtml(r.group)}</td>
      <td>${escapeHtml(r.label)}</td>
      <td class="help-audit-note">${escapeHtml(r.note)}</td>
    </tr>
  `).join('');

  return `
    <div class="help-audit-summary">${escapeHtml(summaryLine)}</div>
    <div class="help-audit-table-wrap">
      <table class="help-audit-table">
        <thead>
          <tr><th>Status</th><th>Group</th><th>Control</th><th>Note</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * @param {{ getVariation: () => object, getCinematic: () => object, getViscosity: () => number, hasAudio: () => boolean }} ctx
 */
export function setupHelpPanel(ctx) {
  const dialog = document.getElementById('help-dialog');
  const openBtn = document.getElementById('help-open-btn');
  const closeBtn = document.getElementById('help-close-btn');
  const content = document.getElementById('help-content');
  const auditBtn = document.getElementById('help-audit-btn');
  const auditOut = document.getElementById('help-audit-results');

  if (!dialog || !content) return;

  content.innerHTML = renderHelpContent();

  function openHelp() {
    dialog.hidden = false;
    document.body.classList.add('help-open');
    openBtn?.setAttribute('aria-expanded', 'true');
  }

  function closeHelp() {
    dialog.hidden = true;
    document.body.classList.remove('help-open');
    openBtn?.setAttribute('aria-expanded', 'false');
  }

  openBtn?.addEventListener('click', openHelp);
  closeBtn?.addEventListener('click', closeHelp);
  dialog.querySelector('.help-backdrop')?.addEventListener('click', closeHelp);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.hidden) closeHelp();
  });

  auditBtn?.addEventListener('click', () => {
    if (!auditOut) return;
    auditOut.hidden = false;
    auditOut.innerHTML = '<p class="help-audit-running">Checking controls…</p>';
    requestAnimationFrame(() => {
      const results = runControlAudit(ctx);
      auditOut.innerHTML = renderAuditReport(results);
    });
  });
}
