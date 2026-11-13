import { course, grade, validRecord } from './assessment-core.js';
export async function drawCertificate(canvas, record) {
  if (!validRecord(record)) throw Error('A passing completion record is required.');
  const logo = new Image(); logo.src = 'assets/kryptnet-logo.jpg'; await logo.decode();
  canvas.width = 1684; canvas.height = 1190;
  const ctx = canvas.getContext('2d');
  const text = (value, y, size, color = '#203c35', font = 'Arial', weight = '') => { ctx.font = `${weight} ${size}px ${font}`.trim(); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(value, 842, y); };
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1684, 1190);
  ctx.fillStyle = '#080887'; ctx.fillRect(0, 0, 1684, 20); ctx.fillRect(0, 1170, 1684, 20);
  ctx.strokeStyle = '#b59955'; ctx.lineWidth = 2; ctx.strokeRect(47, 47, 1590, 1096);
  ctx.strokeStyle = '#dbe6df'; ctx.lineWidth = 1; ctx.strokeRect(59, 59, 1566, 1072);
  ctx.drawImage(logo, 662, 86, 360, 144);
  text(course.certificateTitle, 296, 53, '#080887', 'Georgia');
  text('CERTIFICATE OF COMPLETION / SELF-ASSESSED LEARNING', 342, 20, '#7a673b');
  text('This certificate records that', 424, 24, '#5d7068');
  let size = 66;
  do { ctx.font = `${size}px Georgia`; if (ctx.measureText(record.name).width <= 1370) break; size -= 1; } while (size > 12);
  text(record.name, 530, size, '#970909', 'Georgia');
  ctx.strokeStyle = '#c4d6cc'; ctx.beginPath(); ctx.moveTo(280, 566); ctx.lineTo(1404, 566); ctx.stroke();
  text('has passed the course assessment in', 631, 24, '#5d7068');
  text(course.title, 699, 39, '#203c35', 'Georgia', 'bold');
  text('IPv4 Addressing, VLANs, and Packet Forwarding', 747, 23, '#5d7068');
  const result = grade(record.ids, record.answers);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+4', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(record.date));
  text(`Assessment score: ${result.score}%   |   Required pass mark: ${course.passMark}%`, 835, 23);
  text(`Completion date: ${date} (UTC-04:00)`, 883, 21, '#5d7068');
  text(`Certificate ID: ${record.id}`, 958, 18, '#5d7068', 'monospace');
  text(`Issued by ${course.issuer} as a browser-based self-assessment record.`, 1034, 19, '#5d7068');
  text('Identity and results are not independently verified. This is not an accredited qualification.', 1068, 18, '#5d7068');
  return canvas;
}
export async function certificatePDF(record) {
  const canvas = await drawCertificate(document.createElement('canvas'), record);
  if (!globalThis.PDFLib) throw Error('The PDF library did not load. Reload the page and try again.');
  const pdf = await PDFLib.PDFDocument.create();
  pdf.setTitle(`${course.certificateTitle} - ${course.title}`); pdf.setAuthor(course.issuer);
  pdf.setSubject(`Self-assessed completion for ${record.name}; certificate ${record.id}`);
  const image = await pdf.embedPng(canvas.toDataURL('image/png'));
  const page = pdf.addPage([842, 595]); page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 });
  return pdf.save();
}
