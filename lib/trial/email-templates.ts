// Trial notification email templates.
// Both functions return { html, text, subject } ready to pass to Resend.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const BRAND_COLOR = '#1d4ed8'; // blue-700
const FROM_NAME   = 'InvoiceGuard';

// ─── Shared layout wrapper ─────────────────────────────────────────────────────

function wrapLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

          <!-- Logo bar -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:24px 40px">
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em">${FROM_NAME}</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #e2e8f0">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">
                Wiadomość wysłana automatycznie przez ${FROM_NAME}.<br />
                Zarządzaj powiadomieniami w ustawieniach konta.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Trial expiring soon (48 h) ───────────────────────────────────────────────

export interface TrialExpiringSoonOptions {
  companyName:  string;
  ownerEmail:   string;
  expiresAt:    Date;
  upgradeUrl:   string;
}

export function buildTrialExpiringSoonEmail(opts: TrialExpiringSoonOptions): {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
} {
  const { companyName, ownerEmail, expiresAt, upgradeUrl } = opts;
  const expiryStr = expiresAt.toLocaleDateString('pl-PL', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const subject = `Twój okres próbny kończy się wkrótce – ${escapeHtml(companyName)}`;

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3">
      Twój okres próbny kończy się wkrótce
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6">
      Cześć,<br />
      Okres próbny dla firmy <strong>${escapeHtml(companyName)}</strong> wygaśnie
      <strong>${escapeHtml(expiryStr)}</strong>.
    </p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.6">
        <strong>Nie stracisz dostępu do danych</strong> — wszystkie faktury i raporty pozostaną.
        Jednak po wygaśnięciu trialu zostaniesz przełączony na plan Starter
        (1 użytkownik, 25 dostawców, 10 raportów/mies., bez wystawiania faktur).
      </p>
    </div>

    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">
      Uaktualnij do planu <strong>Professional</strong>, aby zachować pełny dostęp:
    </p>

    <ul style="margin:0 0 28px;padding-left:20px;font-size:14px;color:#475569;line-height:1.8">
      <li>Do 3 użytkowników</li>
      <li>Nieograniczeni dostawcy</li>
      <li>Nieograniczone raporty miesięczne</li>
      <li>Wystawianie faktur (KSeF)</li>
      <li>Wsparcie priorytetowe</li>
    </ul>

    <a href="${escapeHtml(upgradeUrl)}"
       style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;font-size:15px;font-weight:600;padding:13px 28px;border-radius:8px;text-decoration:none">
      Przejdź na Professional &rarr;
    </a>
  `;

  const text = [
    `Twój okres próbny kończy się wkrótce – ${companyName}`,
    '',
    `Okres próbny dla firmy "${companyName}" wygaśnie ${expiryStr}.`,
    '',
    'Po wygaśnięciu trialu zostaniesz przełączony na plan Starter.',
    '',
    'Uaktualnij do Professional, aby zachować pełny dostęp:',
    `  ${upgradeUrl}`,
    '',
    'Korzyści Professional:',
    '  - Do 3 użytkowników',
    '  - Nieograniczeni dostawcy',
    '  - Nieograniczone raporty',
    '  - Wystawianie faktur (KSeF)',
    '  - Wsparcie priorytetowe',
  ].join('\n');

  return {
    to:      ownerEmail,
    subject,
    html:    wrapLayout(subject, bodyHtml),
    text,
  };
}

// ─── Trial expired ────────────────────────────────────────────────────────────

export interface TrialExpiredOptions {
  companyName: string;
  ownerEmail:  string;
  upgradeUrl:  string;
}

export function buildTrialExpiredEmail(opts: TrialExpiredOptions): {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
} {
  const { companyName, ownerEmail, upgradeUrl } = opts;
  const subject = `Twój okres próbny zakończył się – ${escapeHtml(companyName)}`;

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3">
      Twój okres próbny zakończył się
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6">
      Cześć,<br />
      7-dniowy okres próbny dla firmy <strong>${escapeHtml(companyName)}</strong> właśnie wygasł.
      Twoje konto zostało automatycznie przełączone na plan <strong>Starter</strong>.
    </p>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#c2410c">Co zmienia się w planie Starter:</p>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#9a3412;line-height:1.8">
        <li>Limit 1 użytkownik (dodatkowi zostaną dezaktywowani)</li>
        <li>Limit 25 dostawców</li>
        <li>10 raportów miesięcznie</li>
        <li>Brak możliwości wystawiania faktur</li>
      </ul>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#475569;line-height:1.6">
      <strong>Twoje dane są bezpieczne</strong> — wszystkie faktury i raporty pozostają dostępne.
    </p>
    <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6">
      Przejdź na plan Professional w dowolnej chwili, aby odblokować wszystkie funkcje.
    </p>

    <a href="${escapeHtml(upgradeUrl)}"
       style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;font-size:15px;font-weight:600;padding:13px 28px;border-radius:8px;text-decoration:none">
      Uaktualnij teraz &rarr;
    </a>

    <p style="margin:28px 0 0;font-size:13px;color:#94a3b8;line-height:1.5">
      Masz pytania? Odpowiedz na tę wiadomość, a nasz zespół pomoże Ci w przejściu na właściwy plan.
    </p>
  `;

  const text = [
    `Twój okres próbny zakończył się – ${companyName}`,
    '',
    `7-dniowy okres próbny dla firmy "${companyName}" właśnie wygasł.`,
    'Twoje konto zostało automatycznie przełączone na plan Starter.',
    '',
    'Co zmienia się w planie Starter:',
    '  - Limit 1 użytkownik',
    '  - Limit 25 dostawców',
    '  - 10 raportów miesięcznie',
    '  - Brak wystawiania faktur',
    '',
    'Twoje dane są bezpieczne — wszystkie faktury i raporty pozostają.',
    '',
    'Uaktualnij do Professional:',
    `  ${upgradeUrl}`,
  ].join('\n');

  return {
    to:      ownerEmail,
    subject,
    html:    wrapLayout(subject, bodyHtml),
    text,
  };
}
