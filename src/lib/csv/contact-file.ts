/**
 * Parses an uploaded contact list into phone numbers (and names), so a whole
 * list can seed a campaign or the contact book in one upload instead of being
 * typed in one at a time.
 *
 * Dependency-free on purpose. It covers the formats real exports actually use:
 *   - CSV (comma), the default from every spreadsheet and CRM
 *   - TSV (tab) and semicolon-delimited (what Excel exports in locales that use
 *     a comma for the decimal point)
 *   - vCard (.vcf), the format phones and Google Contacts export
 *
 * True binary Excel (.xlsx) is a zip of XML and needs a heavyweight parser with
 * a poor security history, so it is intentionally out of scope here — the UI
 * points those users at "Save As CSV", which every version of Excel can do.
 */

export type ContactFileFormat = "csv" | "tsv" | "semicolon" | "vcard";

export interface ParsedContact {
  name: string | null;
  phone: string; // normalized, E.164-ish
}

export interface ContactFileResult {
  format: ContactFileFormat;
  contacts: ParsedContact[];
  /** A delimited file whose header never matched a phone column. */
  phoneColumnFound: boolean;
  totalRows: number;
  skippedNoPhone: number;
  skippedInvalidPhone: number;
  skippedDuplicate: number;
}

/**
 * RFC-4180-ish parser generalized to any single-character delimiter. Handles
 * quoted fields (so `"Doe, Jane",+15550001234` stays two cells), escaped quotes
 * (`""`), and CRLF/LF line endings.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Picks the delimiter from the first non-empty line by counting candidates.
 * A real export is overwhelmingly one of comma / tab / semicolon.
 */
export function detectDelimiter(text: string): { delimiter: string; format: ContactFileFormat } {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best[0] === "\t" && best[1] > 0) return { delimiter: "\t", format: "tsv" };
  if (best[0] === ";" && best[1] > 0) return { delimiter: ";", format: "semicolon" };
  return { delimiter: ",", format: "csv" };
}

/**
 * Maps a header cell to one of our columns. Exports label the same column a
 * dozen ways ("Phone Number", "Mobile", "Cell"); making a user rename headers
 * before uploading is a pointless chore.
 */
export function columnFor(
  header: string
): "name" | "phone" | "email" | "company" | "notes" | null {
  const key = header.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["name", "full name", "fullname", "contact", "contact name", "first name"].includes(key))
    return "name";
  if (
    [
      "phone",
      "phone number",
      "phonenumber",
      "mobile",
      "mobile number",
      "cell",
      "cell phone",
      "number",
      "telephone",
      "tel",
      "phone1",
      "primary phone",
    ].includes(key)
  ) {
    return "phone";
  }
  if (["email", "e mail", "email address"].includes(key)) return "email";
  if (["company", "organization", "organisation", "business", "account"].includes(key))
    return "company";
  if (["notes", "note", "comment", "comments", "description"].includes(key)) return "notes";
  return null;
}

/**
 * Best-effort E.164 normalization for a dialer.
 *
 * Returns null for anything that clearly is not a phone number so it can be
 * counted as skipped rather than dialed. A US-style 10/11-digit number is
 * assumed to be +1 (the common case in a plain-CSV export); anything else must
 * carry its own country code, because guessing a wrong country dials a wrong
 * person.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;

  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  if (hadPlus) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  // Has enough digits to plausibly include a country code already.
  return `+${digits}`;
}

/** Extract FN (name) and TEL (phone) pairs from a vCard file. */
function parseVcard(text: string): { name: string | null; rawPhone: string }[] {
  const out: { name: string | null; rawPhone: string }[] = [];
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    const fn = card.match(/^FN[^:]*:(.+)$/im)?.[1]?.trim() ?? null;
    const tels = [...card.matchAll(/^TEL[^:]*:(.+)$/gim)].map((m) => m[1].trim());
    if (tels.length === 0) continue;
    for (const tel of tels) out.push({ name: fn, rawPhone: tel });
  }
  return out;
}

/**
 * Unified entry point: given a file's name and text, returns the phone numbers
 * (with names where present) plus a breakdown of what was skipped and why, so
 * the UI can be honest about "42 numbers found, 3 skipped".
 */
export function extractContactsFromFile(input: {
  filename: string;
  text: string;
}): ContactFileResult {
  const { filename, text } = input;
  const isVcard = /\.vcf$/i.test(filename) || /BEGIN:VCARD/i.test(text.slice(0, 200));

  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  let totalRows = 0;
  let skippedNoPhone = 0;
  let skippedInvalidPhone = 0;
  let skippedDuplicate = 0;

  const add = (name: string | null, rawPhone: string) => {
    if (!rawPhone.trim()) {
      skippedNoPhone += 1;
      return;
    }
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      skippedInvalidPhone += 1;
      return;
    }
    if (seen.has(phone)) {
      skippedDuplicate += 1;
      return;
    }
    seen.add(phone);
    contacts.push({ name: name?.trim() || null, phone });
  };

  if (isVcard) {
    const rows = parseVcard(text);
    totalRows = rows.length;
    for (const r of rows) add(r.name, r.rawPhone);
    return {
      format: "vcard",
      contacts,
      phoneColumnFound: true,
      totalRows,
      skippedNoPhone,
      skippedInvalidPhone,
      skippedDuplicate,
    };
  }

  const { delimiter, format } = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) {
    return {
      format,
      contacts,
      phoneColumnFound: false,
      totalRows: 0,
      skippedNoPhone: 0,
      skippedInvalidPhone: 0,
      skippedDuplicate: 0,
    };
  }

  // Decide whether the first row is a header by whether any cell maps to a
  // known column. A headerless list (just phone numbers, one per line) is
  // common, so fall back to treating the first column as the phone.
  const header = rows[0].map((h) => columnFor(h));
  const hasHeader = header.some((c) => c !== null);
  let phoneIdx = header.indexOf("phone");
  const nameIdx = header.indexOf("name");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Headerless, or a header without a recognizable phone column: assume the
  // first column holds the number (the overwhelmingly common shape).
  const phoneColumnFound = phoneIdx !== -1;
  if (phoneIdx === -1) phoneIdx = 0;

  totalRows = dataRows.length;
  for (const row of dataRows) {
    const rawPhone = (row[phoneIdx] ?? "").trim();
    const name = nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : null;
    add(name, rawPhone);
  }

  return {
    format,
    contacts,
    phoneColumnFound,
    totalRows,
    skippedNoPhone,
    skippedInvalidPhone,
    skippedDuplicate,
  };
}
