/**
 * Convert Arabic-Indic (U+0660–0669) and Extended Arabic-Indic / Persian
 * (U+06F0–06F9) digits to ASCII, and the Arabic decimal/thousands separators
 * to their ASCII equivalents. Staff and customers typing on Arabic keyboards
 * frequently produce these characters in prices, quantities and barcodes.
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/٬/g, ","); // Arabic thousands separator
}
