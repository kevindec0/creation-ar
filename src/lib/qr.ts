import QRCode from "qrcode";

const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#1B1F27", light: "#FFFFFF" } };

export const qrSvg = (text: string) => QRCode.toString(text, { ...opts, type: "svg" });
export const qrPng = (text: string) => QRCode.toBuffer(text, { ...opts, type: "png", width: 1024 });
