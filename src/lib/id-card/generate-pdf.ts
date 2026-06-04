import QRCode from 'qrcode';

export type IdCardPerson = {
  kind: 'student' | 'staff';
  fullName: string;
  idNumber: string;
  qrData: string;
  /** Pre-loaded base64 data URL — preferred for PDF */
  photoDataUrl?: string | null;
  photoUrl?: string | null;
  birth?: string;
  address?: string;
  className?: string;
  roleLabel?: string;
};

export type SchoolBranding = {
  name: string;
  address?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  primaryColor?: string | null;
};

const CARD_W = 85.6;
const CARD_H = 54;

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#1e3a8a').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [30, 58, 138];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighterRgb(rgb: [number, number, number], amount = 45): [number, number, number] {
  return [
    Math.min(255, rgb[0] + amount),
    Math.min(255, rgb[1] + amount),
    Math.min(255, rgb[2] + amount),
  ];
}

async function resolvePhotoDataUrl(person: IdCardPerson): Promise<string | null> {
  if (person.photoDataUrl) return person.photoDataUrl;
  if (!person.photoUrl || typeof window === 'undefined') return null;
  try {
    const { imageUrlToDataUrl } = await import('@/lib/photo');
    return await imageUrlToDataUrl(person.photoUrl);
  } catch {
    return null;
  }
}

async function drawFront(
  doc: any,
  person: IdCardPerson,
  school: SchoolBranding,
  navy: [number, number, number],
  accent: [number, number, number]
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, CARD_W, CARD_H, 'F');

  doc.setFillColor(245, 247, 252);
  doc.triangle(0, 0, 30, 0, 0, 20, 'F');
  doc.setFillColor(235, 242, 252);
  doc.triangle(CARD_W, CARD_H, CARD_W - 18, CARD_H, CARD_W, CARD_H - 14, 'F');

  doc.setFillColor(...accent);
  doc.triangle(0, 0, 40, 0, 0, 12, 'F');
  doc.setFillColor(...navy);
  doc.triangle(0, 0, 24, 0, 0, 8, 'F');

  let nameY = 7;
  if (school.logoUrl && String(school.logoUrl).startsWith('data:')) {
    try {
      const fmt = school.logoUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(school.logoUrl, fmt, CARD_W / 2 - 7, 1.5, 14, 9);
      nameY = 12;
    } catch {
      /* logo optional */
    }
  }

  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text((school.name || 'SCHOOL NAME').toUpperCase(), CARD_W / 2, nameY, {
    align: 'center',
    maxWidth: CARD_W - 6,
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  doc.setTextColor(70, 70, 70);
  doc.text(school.address || 'Address of School', CARD_W / 2, nameY + 3.5, {
    align: 'center',
    maxWidth: CARD_W - 6,
  });

  const bannerTop = nameY + 6;
  const bannerLabel = person.kind === 'staff' ? 'STAFF CARD' : 'STUDENT CARD';
  doc.setFillColor(...navy);
  doc.roundedRect(2.5, bannerTop, CARD_W - 5, 6.5, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(bannerLabel, CARD_W / 2, bannerTop + 3.7, { align: 'center' });

  const photoX = 4;
  const photoY = bannerTop + 7.5;
  const photoW = 23;
  const photoH = 27;
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.35);
  doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, 'S');

  const photoData = await resolvePhotoDataUrl(person);
  if (photoData) {
    try {
      const fmt = photoData.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(photoData, fmt, photoX + 0.4, photoY + 0.4, photoW - 0.8, photoH - 0.8);
    } catch {
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, person, navy);
    }
  } else {
    drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, person, navy);
  }

  const tx = 29;
  let ty = 21;
  const line = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(...navy);
    doc.text(`${label}:`, tx, ty);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(35, 35, 35);
    const val = (value || '—').substring(0, 32);
    doc.text(val, tx + 14, ty, { maxWidth: 36 });
    ty += 4.2;
  };

  line('NAME', person.fullName);
  if (person.birth && person.birth !== '—') line('BIRTH', person.birth);
  line('ADDRESS', person.address || '—');
  line('ID NO', person.idNumber);
  if (person.kind === 'student' && person.className) line('CLASS', person.className);
  if (person.kind === 'staff' && person.roleLabel) line('ROLE', person.roleLabel);

  const qrPayload = person.qrData || `MYEDURIDE:${person.idNumber}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 256,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#1e3a8a', light: '#ffffff' },
    });
    doc.addImage(qrDataUrl, 'PNG', CARD_W - 23.5, 32, 19, 19);
  } catch (e) {
    console.error('[id-card] QR failed:', e);
    doc.setDrawColor(...navy);
    doc.rect(CARD_W - 23.5, 32, 19, 19, 'S');
    doc.setFontSize(4);
    doc.text('QR ERROR', CARD_W - 14, 42, { align: 'center' });
  }

  doc.setFontSize(3.5);
  doc.setTextColor(...accent);
  doc.text('MyEduRide', CARD_W - 2, 3, { align: 'right' });
}

function drawPhotoPlaceholder(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  person: IdCardPerson,
  navy: [number, number, number]
) {
  doc.setFillColor(230, 238, 248);
  doc.roundedRect(x + 0.5, y + 0.5, w - 1, h - 1, 1.5, 1.5, 'F');
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const initials = person.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  doc.text(initials || '?', x + w / 2, y + h / 2 + 2, { align: 'center' });
}

function drawBack(
  doc: any,
  school: SchoolBranding,
  kind: 'student' | 'staff',
  navy: [number, number, number]
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, CARD_W, CARD_H, 'F');

  doc.setFillColor(245, 247, 252);
  doc.triangle(CARD_W, 0, CARD_W - 22, 0, CARD_W, 16, 'F');

  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text((school.name || 'SCHOOL').toUpperCase(), CARD_W / 2, 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  doc.setTextColor(60, 60, 60);
  doc.text(school.address || '', CARD_W / 2, 11, { align: 'center', maxWidth: CARD_W - 8 });

  doc.setDrawColor(210, 218, 230);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(3, 15, 38, 24, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.5);
  doc.setTextColor(...navy);
  doc.text('AUTHORISED SIGNATURE', 5, 19);
  if (school.signatureUrl && String(school.signatureUrl).startsWith('data:')) {
    try {
      const fmt = school.signatureUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(school.signatureUrl, fmt, 6, 20.5, 30, 9);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(4.8);
      doc.text('Principal / Director', 5, 34);
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.8);
      doc.text('Authorized by School', 5, 34);
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.8);
    doc.text('Authorized by School', 5, 34);
  }

  doc.roundedRect(45, 15, 37, 24, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4);
  doc.setTextColor(30, 30, 30);
  doc.text(
    `If found, please return this card to ${school.name || 'the school'}. Thank you.`,
    47,
    21,
    { maxWidth: 33 }
  );

  doc.setFillColor(...navy);
  doc.rect(0, 43, CARD_W, 11, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(3.8);
  const policy =
    kind === 'staff'
      ? 'Official staff ID. Must be carried on campus.'
      : 'Official student ID. Must be carried on campus at all times.';
  doc.text(policy, CARD_W / 2, 49, { align: 'center', maxWidth: CARD_W - 4 });
}

/** Returns PDF as Buffer (server) or triggers download (browser). */
export async function buildIdCardsPdfBuffer(
  persons: IdCardPerson[],
  school: SchoolBranding
): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [CARD_W, CARD_H],
  });

  const navy = hexToRgb(school.primaryColor || '#1e3a8a');
  const accent = lighterRgb(navy, 50);

  for (let i = 0; i < persons.length; i++) {
    const person = persons[i];
    if (i > 0) doc.addPage();
    await drawFront(doc, person, school, navy, accent);
    doc.addPage();
    drawBack(doc, school, person.kind, navy);
  }

  return doc.output('arraybuffer') as ArrayBuffer;
}

export async function generateIdCardsPdf(
  persons: IdCardPerson[],
  school: SchoolBranding,
  fileName?: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const buffer = await buildIdCardsPdfBuffer(persons, school);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || `id_cards_${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
