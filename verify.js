const input = document.querySelector('#certificate-id'), status = document.querySelector('#verification-status'), record = document.querySelector('#verification-record');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function verify() {
  record.hidden = true; status.textContent = 'Checking issuer record...';
  try {
    const response = await fetch('/api/verify/' + encodeURIComponent(input.value.trim())); const data = await response.json(); if (!response.ok) throw Error(data.error);
    status.textContent = 'Issuer completion record found.';
    record.innerHTML = `<h2>${esc(data.name)}</h2><p>${esc(data.course)} / ${data.score}% / ${esc(data.date.slice(0, 10))}</p><p>Issuer: ${esc(data.issuer)}</p><label class="field">Compare downloaded PDF<input id="compare-pdf" type="file" accept="application/pdf"></label><p id="file-status" role="status">Select the PDF to compare it with the issued file.</p>`; record.hidden = false;
    document.querySelector('#compare-pdf').onchange = async event => {
      const file = event.target.files[0]; if (!file) return; const message = document.querySelector('#file-status');
      if (file.size > 10000000) { message.textContent = 'File exceeds the 10 MB comparison limit.'; return; }
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
      message.textContent = !data.sha256 ? 'No issued PDF fingerprint is available yet.' : digest === data.sha256 ? 'Match: this PDF is identical to the issuer-held file.' : 'Mismatch: this file is not identical to the issuer-held PDF. It may have been modified or re-saved.';
    };
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('#verify-form').onsubmit = event => { event.preventDefault(); verify(); };
const id = new URLSearchParams(location.search).get('id'); if (id) { input.value = id; verify(); }
