/**
 * Shared vision client — Agents 8 & 10
 * Webcam → POST /api/vision/detect → boxes + alerts
 */

export const ALERTS_KEY_WAREHOUSE = 'kafi_warehouse_alerts';
export const ALERTS_KEY_SECURITY = 'kafi_security_alerts';

export function loadAlerts(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

export function saveAlerts(key, alerts) {
  localStorage.setItem(key, JSON.stringify(alerts.slice(0, 500)));
}

export function pushAlert(key, alert) {
  const list = loadAlerts(key);
  list.unshift({ ...alert, id: `a-${Date.now()}`, at: new Date().toISOString() });
  saveAlerts(key, list);
  return list;
}

export async function fetchVisionStatus() {
  const r = await fetch('/api/vision/status');
  return r.json();
}

export async function detectFrame(canvas, mode = 'warehouse', confidence = 0.35) {
  const image = canvas.toDataURL('image/jpeg', 0.75);
  const r = await fetch('/api/vision/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mode, confidence }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Detection failed');
  return data;
}

export function drawBoxes(canvas, overlay, detections = []) {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const colors = {
    person: '#ff4444', carton: '#c5992e', rice_bag: '#7fd67f', spice_pack: '#2b7de9',
    damaged: '#ff6b6b', missing_label: '#ffb347', leakage: '#ff00aa', default: '#00e5ff',
  };
  detections.forEach(d => {
    const b = d.box;
    if (!b) return;
    const col = colors[d.label] || colors.default;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = col + '33';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = col;
    ctx.font = '12px Segoe UI, sans-serif';
    const tag = `${d.label} ${Math.round((d.confidence || 0) * 100)}%`;
    ctx.fillText(tag, b.x + 4, b.y > 16 ? b.y - 6 : b.y + 14);
  });
}

export function exportAlertsCSV(alerts, filename) {
  const headers = ['Time', 'Severity', 'Type', 'Message', 'Label'];
  const rows = alerts.map(a => [a.at, a.severity, a.type, a.message, a.label || '']);
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export class VisionMonitor {
  constructor({ video, canvas, overlay, mode, alertsKey, onTick, onError }) {
    this.video = video;
    this.canvas = canvas;
    this.overlay = overlay;
    this.mode = mode;
    this.alertsKey = alertsKey;
    this.onTick = onTick;
    this.onError = onError;
    this.running = false;
    this.intervalMs = 2500;
    this._timer = null;
    this._stream = null;
  }

  async startCamera() {
    this._stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this._stream;
    await this.video.play();
    this._syncCanvasSize();
  }

  stopCamera() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this.stopMonitoring();
  }

  _syncCanvasSize() {
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    this.canvas.width = w;
    this.canvas.height = h;
    this.overlay.width = w;
    this.overlay.height = h;
  }

  startMonitoring() {
    if (this.running) return;
    this.running = true;
    this._tick();
    this._timer = setInterval(() => this._tick(), this.intervalMs);
  }

  stopMonitoring() {
    this.running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async _tick() {
    if (!this.video.videoWidth) return;
    this._syncCanvasSize();
    const ctx = this.canvas.getContext('2d');
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    try {
      const result = await detectFrame(this.canvas, this.mode);
      drawBoxes(this.canvas, this.overlay, result.detections);
      (result.alerts || []).forEach(a => pushAlert(this.alertsKey, a));
      if (this.onTick) this.onTick(result);
    } catch (e) {
      if (this.onError) this.onError(e);
    }
  }
}
