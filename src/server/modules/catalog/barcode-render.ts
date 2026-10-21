import "server-only";
import bwipjs from "bwip-js/node";

const SYMBOLOGY: Record<string, string> = {
  EAN_13: "ean13",
  EAN_8: "ean8",
  UPC_A: "upca",
  GTIN_14: "itf14",
  CODE_128: "code128",
};

/**
 * Render a stored (already validated) barcode as an SVG data URI for printing.
 * Returns null for unknown symbologies.
 */
export function barcodeSvgDataUri(barcode: string, barcodeType: string): string | null {
  const bcid = SYMBOLOGY[barcodeType];
  if (!bcid) return null;
  const svg = bwipjs.toSVG({
    bcid,
    text: barcode,
    scale: 2,
    height: 12,
    includetext: true,
    textxalign: "center",
    ...(bcid === "itf14" ? { bordertop: 0, borderbottom: 0, borderwidth: 0 } : {}),
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
