'use client';

import { useEffect, useRef, useState } from 'react';

const ORIGIN = 'http://localhost:3000';
const errors: Record<string, string> = {
  AUTH_BLOCKED: 'Authentication blocked. Riset belum membuktikan metode autentikasi lokal. Tidak ada request ke Meta.',
  SESSION_UNAVAILABLE: 'Otorisasi Facebook tidak tersedia atau kedaluwarsa. Spike tidak membaca session browser.',
  INVALID_INPUT: 'Periksa ID numerik, URL tujuan HTTPS, dan file PNG/JPEG maksimal 5 MiB.',
  REJECTED: 'Operasi atau input ditolak oleh allowlist.',
  ACCESS_DENIED: 'Akses ditolak Meta. Periksa akses Ad Account, Page, dan permission.',
  UPLOAD_FAILED: 'Upload image gagal atau respons tidak memiliki URL image.',
  CREATIVE_FAILED: 'Creative gagal dibuat. Periksa akses Page dan field creative.',
  READ_FAILED: 'Gagal membaca creative. Periksa akses dan permission.',
  POLL_TIMEOUT: 'Story ID belum tersedia setelah 15 attempt. Creative mungkin sudah ada. Test berhenti.',
  NETWORK_ERROR: 'Network atau koneksi extension gagal. Request tidak diulang otomatis.',
  BUSY: 'Spike lain masih berjalan. Tunggu sampai selesai.',
};
const labels: Record<string, string> = {
  UPLOADING: 'Uploading image', IMAGE_UPLOADED: 'Image uploaded', CREATING: 'Creating creative',
  CREATIVE_CREATED: 'Creative ID', POLLING: 'Waiting for story ID', SUCCESS: 'Story ID found — SUCCESS', FAILED: 'FAILED',
};
const fields = [
  ['adAccountId', 'Ad Account ID'], ['pageId', 'Page ID'], ['message', 'Primary Text'],
  ['link', 'Destination URL'], ['caption', 'Display URL'], ['title', 'Card Title'], ['description', 'Card Description'],
] as const;

export default function SpikeForm() {
  const [detected, setDetected] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<{ creativeId: string; storyId: string; attempt: number }>();
  const active = useRef('');
  const pingId = useRef('');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    pingId.current = crypto.randomUUID();
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== ORIGIN || window.location.origin !== ORIGIN) return;
      const data = event.data;
      if (!data || data.type !== 'FEWCLONE_EVENT') return;
      if (data.requestId === pingId.current && data.status === 'DETECTED') { setDetected(true); return; }
      if (!active.current || data.requestId !== active.current || !Object.hasOwn(labels, data.status)) return;
      const id = typeof data.creativeId === 'string' && /^\d{1,30}$/.test(data.creativeId) ? data.creativeId : '';
      const attempt = Number.isInteger(data.attempt) && data.attempt >= 1 && data.attempt <= 15 ? data.attempt : 0;
      let line = labels[data.status];
      if (data.status === 'CREATIVE_CREATED') line += `: ${id}`;
      if (data.status === 'POLLING') line = `Polling attempt ${attempt}/15`;
      if (data.status === 'FAILED') line += `: ${Object.hasOwn(errors, data.code) ? errors[data.code] : errors.NETWORK_ERROR}`;
      setLogs(previous => [...previous, line]);
      if (data.status === 'SUCCESS' && id && attempt && typeof data.effectiveObjectStoryId === 'string' && /^\d{1,30}_\d{1,30}$/.test(data.effectiveObjectStoryId)) {
        setResult({ creativeId: id, storyId: data.effectiveObjectStoryId, attempt });
      }
      if (data.status === 'SUCCESS' || data.status === 'FAILED') {
        active.current = ''; setRunning(false); clearTimeout(timeout.current);
      }
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'FEWCLONE_PING', requestId: pingId.current }, ORIGIN);
    const detectionTimer = setTimeout(() => setLogs(previous => previous.length ? previous : ['Jika extension belum terdeteksi, install/reload extension lalu reload halaman.']), 2000);
    return () => { window.removeEventListener('message', onMessage); clearTimeout(detectionTimer); clearTimeout(timeout.current); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || running || !detected) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('image');
    if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setLogs([errors.INVALID_INPUT]); return;
    }
    active.current = crypto.randomUUID();
    setRunning(true); setLogs([]); setResult(undefined);
    try {
      const bytes = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(file);
      });
      const input = Object.fromEntries(fields.map(([name]) => [name, String(form.get(name) || '')]));
      window.postMessage({ type: 'FEWCLONE_RUN', requestId: active.current, input: { ...input, image: { bytes, mime: file.type } } }, ORIGIN);
      timeout.current = setTimeout(() => {
        setLogs(previous => [...previous, 'FAILED: Extension tidak merespons. Eksekusi mungkin terputus; jangan otomatis mengulang create. Reload extension sebelum mencoba lagi.']);
        // Fail closed: keep the run locked after uncertain completion.
      }, 510000);
    } catch { active.current = ''; setRunning(false); setLogs([errors.INVALID_INPUT]); }
  }

  return <main className="mx-auto max-w-3xl space-y-6 p-6 sm:p-10">
    <h1 className="text-3xl font-semibold">One Card · Spike 1</h1>
    <p>Development only · Upload image → create creative → story ID → STOP</p>
    <p role="status" className="font-medium">{detected ? 'Extension detected' : 'Extension belum terdeteksi'}</p>
    <p className="rounded border border-amber-500 bg-amber-100 p-4 text-amber-950">AUTH BLOCKER: autentikasi Graph belum terbukti. Build ini berhenti sebelum request Meta. Tidak perlu memasukkan token, cookie, atau session.</p>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {fields.map(([name, label]) => <label key={name} className="grid gap-1 text-sm">
        {label}
        <input name={name} type={name === 'link' ? 'url' : 'text'} required={['adAccountId', 'pageId', 'link', 'title'].includes(name)}
          pattern={name === 'adAccountId' || name === 'pageId' ? '[0-9]{1,30}' : undefined}
          maxLength={name === 'link' ? 4096 : 5000} disabled={running} className="rounded border p-2" />
      </label>)}
      <label className="grid gap-1 text-sm">Image · PNG/JPEG, maximum 5 MiB<input name="image" type="file" accept="image/png,image/jpeg" required disabled={running} className="rounded border p-2" /></label>
      <button disabled={!detected || running} className="rounded bg-blue-700 p-3 font-semibold text-white disabled:opacity-40 sm:col-span-2">{running ? 'TEST RUNNING' : 'TEST ONE CARD'}</button>
    </form>
    <ol aria-live="polite" className="space-y-2 rounded border p-4">{logs.map((line, index) => <li key={index}>{line}</li>)}</ol>
    {result && <div className="space-y-2 rounded border border-green-600 p-4">
      <p className="font-semibold">SUCCESS</p><p>Creative ID: {result.creativeId}</p><p>Effective Object Story ID: {result.storyId}</p><p>Found on attempt: {result.attempt}</p>
      <p>Spike stops here. Nothing was published by this test.</p>
    </div>}
  </main>;
}
