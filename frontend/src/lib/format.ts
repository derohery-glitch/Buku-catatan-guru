export function formatRupiah(n: number | string | undefined | null): string {
  const num = Math.round(Number(n) || 0);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  // Insert dot thousand separator
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}Rp ${formatted}`;
}

export function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

export function formatDateID(yyyyMMdd: string): string {
  // "2026-02-17" -> "17 Feb 2026"
  const m = yyyyMMdd?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return yyyyMMdd ?? "";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

export function monthName(m: number): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return months[m - 1] ?? "";
}

export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
