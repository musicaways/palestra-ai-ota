// Pagina "Registrazioni" (#/registrazioni): i video registrati mentre suoni, salvati sul dispositivo.
import { listRecordings, deleteRecording, shareOrDownload } from './camera.js';
import { icon } from './icons.js';

export async function renderRecordings(root) {
  const urls = [];
  root.innerHTML = `
  <div class="library recordings">
    <section class="hero">
      <div class="hero-kicker">${icon('camera', 16)} Registrazioni</div>
      <h1>I tuoi video,<br><span>mentre suoni.</span></h1>
      <p>Registra dal pulsante <b>⋯ → Video</b> di un brano. I video restano su questo dispositivo:
      condividili quando vuoi. Presto potrai pubblicarli nella community di Guitar Song Trainer.</p>
      <div class="hero-actions"><a class="chip-btn" href="#/">${icon('back', 16)} Libreria brani</a></div>
    </section>
    <div class="rec-grid"></div>
  </div>`;
  const grid = root.querySelector('.rec-grid');
  let list = [];
  try { list = await listRecordings(); } catch { /* IndexedDB non disponibile */ }
  if (!list.length) {
    grid.innerHTML = '<p class="empty">Nessuna registrazione ancora. Apri un brano e tocca ⋯ → Video.</p>';
    return () => {};
  }
  for (const rec of list) {
    const card = document.createElement('div');
    card.className = 'rec-card card';
    const url = URL.createObjectURL(rec.blob);
    urls.push(url);
    card.innerHTML = `<video controls playsinline preload="metadata"></video>
      <div class="rec-meta"><b></b><span class="hint"></span></div>
      <div class="tr-actions">
        <button class="chip-btn" data-r="share">Condividi</button>
        ${rec.songId ? `<a class="chip-btn" href="#/song/${encodeURIComponent(rec.songId)}">${icon('guitar', 14)} Brano</a>` : ''}
        <button class="chip-btn" data-r="del">${icon('close', 14)} Elimina</button>
      </div>`;
    card.querySelector('video').src = url;
    card.querySelector('b').textContent = rec.title;
    const d = new Date(rec.date);
    card.querySelector('.hint').textContent = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ${Math.round(rec.duration ?? 0)} s`;
    card.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r === 'share') shareOrDownload(rec);
      if (r === 'del' && confirm('Eliminare questa registrazione?')) { await deleteRecording(rec.id); card.remove(); }
    });
    grid.append(card);
  }
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
