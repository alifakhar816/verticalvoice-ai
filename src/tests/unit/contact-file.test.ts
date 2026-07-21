import { describe, expect, it } from "vitest";
import {
  extractContactsFromFile,
  normalizePhone,
  detectDelimiter,
} from "@/lib/csv/contact-file";

describe("normalizePhone", () => {
  it("keeps an already-E.164 number", () => {
    expect(normalizePhone("+923313320944")).toBe("+923313320944");
  });
  it("strips human formatting", () => {
    expect(normalizePhone("+1 (908) 339-0672")).toBe("+19083390672");
  });
  it("assumes +1 for a bare 10-digit US number", () => {
    expect(normalizePhone("9083390672")).toBe("+19083390672");
  });
  it("treats an 11-digit leading-1 number as +1", () => {
    expect(normalizePhone("19083390672")).toBe("+19083390672");
  });
  it("converts a 00 international prefix to +", () => {
    expect(normalizePhone("0092 331 3320944")).toBe("+923313320944");
  });
  it("rejects too-short and non-numeric junk", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("detectDelimiter", () => {
  it("detects comma, tab, and semicolon", () => {
    expect(detectDelimiter("Name,Phone\nA,1").format).toBe("csv");
    expect(detectDelimiter("Name\tPhone\nA\t1").format).toBe("tsv");
    expect(detectDelimiter("Name;Phone\nA;1").format).toBe("semicolon");
  });
});

describe("extractContactsFromFile", () => {
  it("reads a headered CSV with a named phone column", () => {
    const r = extractContactsFromFile({
      filename: "leads.csv",
      text: "Name,Mobile\nJane Doe,+15550001234\nJohn Roe,(555) 000-5678",
    });
    expect(r.phoneColumnFound).toBe(true);
    expect(r.contacts).toEqual([
      { name: "Jane Doe", phone: "+15550001234" },
      { name: "John Roe", phone: "+15550005678" },
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    const r = extractContactsFromFile({
      filename: "x.csv",
      text: 'Name,Phone\n"Doe, Jane",+15550001234',
    });
    expect(r.contacts[0]).toEqual({ name: "Doe, Jane", phone: "+15550001234" });
  });

  it("falls back to the first column for a headerless list", () => {
    const r = extractContactsFromFile({
      filename: "numbers.txt",
      text: "+15550001111\n5550002222\n+15550003333",
    });
    expect(r.contacts.map((c) => c.phone)).toEqual([
      "+15550001111",
      "+15550002222",
      "+15550003333",
    ]);
  });

  it("parses TSV", () => {
    const r = extractContactsFromFile({
      filename: "x.tsv",
      text: "Name\tPhone\nAmi\t+15550009999",
    });
    expect(r.format).toBe("tsv");
    expect(r.contacts[0]).toEqual({ name: "Ami", phone: "+15550009999" });
  });

  it("parses a vCard, including multiple TELs", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Sam Smith",
      "TEL;TYPE=CELL:+15550001234",
      "END:VCARD",
      "BEGIN:VCARD",
      "FN:Pat Lee",
      "TEL:(555) 000-9876",
      "END:VCARD",
    ].join("\n");
    const r = extractContactsFromFile({ filename: "contacts.vcf", text: vcf });
    expect(r.format).toBe("vcard");
    expect(r.contacts).toEqual([
      { name: "Sam Smith", phone: "+15550001234" },
      { name: "Pat Lee", phone: "+15550009876" },
    ]);
  });

  it("dedupes numbers that normalize to the same value", () => {
    const r = extractContactsFromFile({
      filename: "d.csv",
      text: "Phone\n+15550001234\n(555) 000-1234\n5550001234",
    });
    expect(r.contacts).toHaveLength(1);
    expect(r.skippedDuplicate).toBe(2);
  });

  it("counts rows with an unusable phone as skipped, not dialed", () => {
    const r = extractContactsFromFile({
      filename: "m.csv",
      text: "Name,Phone\nGood,+15550001234\nBad,abc\nEmpty,",
    });
    expect(r.contacts).toHaveLength(1);
    expect(r.skippedInvalidPhone).toBe(1);
    expect(r.skippedNoPhone).toBe(1);
  });

  it("flags when no phone column is recognizable in a headered file", () => {
    const r = extractContactsFromFile({
      filename: "weird.csv",
      text: "First,Last\nJane,Doe",
    });
    // First column is treated as the phone by fallback, but it isn't a real
    // phone, so nothing usable comes out and the caller can warn.
    expect(r.phoneColumnFound).toBe(false);
    expect(r.contacts).toHaveLength(0);
  });
});
