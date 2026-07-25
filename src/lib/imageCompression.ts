// Compressão de imagem 100% no navegador (Canvas API, sem dependência
// externa) — reduz fotos de celular (costumam vir com vários MB) antes
// do upload na página pública de Solicitações de Serviços. Mesmo
// espírito do OCR de ponto em lib/ocr.ts: processamento local, grátis.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isAcceptedImageType(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

// Redimensiona (maior lado <= MAX_DIMENSION) e reencoda como JPEG a
// 75% de qualidade — reduz uma foto típica de celular de vários MB pra
// algumas centenas de KB, sem perda visível relevante pro caso de uso
// (registro de um problema técnico, não fotografia profissional).
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível neste navegador");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao comprimir a imagem"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  } finally {
    bitmap.close();
  }
}
