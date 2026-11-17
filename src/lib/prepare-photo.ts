export type Photo = { id: string; image: Blob; thumbnail: Blob };

function blobFromCanvas(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error())),
      "image/jpeg",
      quality,
    ),
  );
}

async function scaledJpeg(
  image: HTMLImageElement,
  edge: number,
  limit: number,
) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    edge / Math.max(image.naturalWidth, image.naturalHeight),
  );
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error();
  try {
    for (;;) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await blobFromCanvas(canvas, 0.86);
      if (blob.size <= limit) return blob;
      canvas.width = Math.max(1, Math.floor(canvas.width * 0.76));
      canvas.height = Math.max(1, Math.floor(canvas.height * 0.76));
    }
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function preparePhoto(file: File): Promise<Photo> {
  if (file.size > 40 * 1024 * 1024)
    throw new Error("40MB 이하 사진을 선택해 주세요.");
  const src = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = src;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error();
    const full = await scaledJpeg(image, 1600, 1024 * 1024);
    const thumbnail = await scaledJpeg(image, 480, 64 * 1024);
    return { id: crypto.randomUUID(), image: full, thumbnail };
  } catch {
    throw new Error(
      "이 사진을 읽지 못했어요. JPG, PNG 또는 화면 캡처로 다시 선택해 주세요.",
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}
