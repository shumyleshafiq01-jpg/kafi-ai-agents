/**
 * @fileoverview Admin Dashboard Analytics Module — KAFI AI Agent
 * 
 * Renders stats, recent conversations, and CSS-based intent charts.
 * 
 * Zero dependencies — vanilla ES module.
 */

/**
 * Renders statistical cards in the admin dashboard.
 * @param {HTMLElement} container
 * @param {Object} stats
 */
export function renderStats(container, stats) {
  if (!container) return;

  const totalConv = stats.totalConversations || 0;
  const totalMsg = stats.totalMessages || 0;
  const unrecognized = stats.unrecognized || 0;
  const avgSessionSec = stats.avgSessionSec || 0;

  // Format average session duration
  const mins = Math.floor(avgSessionSec / 60);
  const secs = avgSessionSec % 60;
  const avgSessionStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  container.innerHTML = `
    <div class="stat-card stat-card--green">
      <div class="stat-card-label">Total Sessions</div>
      <div class="stat-card-value">${totalConv}</div>
      <div class="stat-card-trend">All-time conversations logged</div>
    </div>
    <div class="stat-card stat-card--gold">
      <div class="stat-card-label">Total Messages</div>
      <div class="stat-card-value">${totalMsg}</div>
      <div class="stat-card-trend">User and bot turns</div>
    </div>
    <div class="stat-card stat-card--teal">
      <div class="stat-card-label">Unrecognized Queries</div>
      <div class="stat-card-value">${unrecognized}</div>
      <div class="stat-card-trend">${totalMsg ? Math.round((unrecognized / totalMsg) * 100) : 0}% fallback rate</div>
    </div>
    <div class="stat-card stat-card--purple">
      <div class="stat-card-label">Avg. Chat Duration</div>
      <div class="stat-card-value">${avgSessionStr}</div>
      <div class="stat-card-trend">From first to last activity</div>
    </div>
  `;
}

/**
 * Renders the recent conversations list.
 * @param {HTMLElement} container
 * @param {Array} sessions
 */
export function renderRecentConversations(container, sessions) {
  if (!container) return;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #9ca3af; font-size: 14px;">
        No conversations logged yet.
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(session => {
    const msgs = session.messages || [];
    const firstMsg = msgs.find(m => m.role === 'user')?.text || 'No user messages';
    const msgCount = msgs.length;
    const time = session.startedAt ? formatTimestamp(session.startedAt) : 'Unknown time';
    const isUrdu = session.language === 'ur';

    return `
      <div class="recent-conv-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #2d2d2d;">
        <div>
          <div style="font-weight: 500; font-size: 14px; color: #f3f4f6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">
            "${escapeHtml(firstMsg)}"
          </div>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">
            ${time} · <span style="text-transform: uppercase;">${session.language || 'en'}</span>
          </div>
        </div>
        <span class="admin-badge ${msgCount > 4 ? 'admin-badge--success' : 'admin-badge--info'}" style="font-size: 11px;">
          ${msgCount} messages
        </span>
      </div>
    `;
  }).join('');
}

/**
 * Renders a CSS-based vertical/horizontal bar chart showing top intents.
 * @param {HTMLElement} container
 * @param {Object} intentData
 */
export function renderIntentChart(container, intentData) {
  if (!container) return;

  const entries = Object.entries(intentData || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // top 5 intents

  if (entries.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #9ca3af; font-size: 14px;">
        No intent data available yet.
      </div>
    `;
    return;
  }

  const maxVal = Math.max(...entries.map(([, val]) => val));

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px; padding: 8px 0;">
      ${entries.map(([intent, count]) => {
        const pct = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;
        return `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: #e5e7eb;">
              <span style="font-family: monospace; font-weight: 500;">${intent}</span>
              <span>${count} (${pct}%)</span>
            </div>
            <div style="background-color: #2d2d2d; height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #1a5e1a, #c5992e); width: ${pct}%; height: 100%; border-radius: 4px;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Helper to format ISO timestamp into human readable format.
 * @param {string} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
