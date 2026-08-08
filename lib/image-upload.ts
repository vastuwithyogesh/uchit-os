export type PreparedImageUpload = {
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
};

type ImageUploadOptions = {
  maxBytes?: number;
  maxWidth?: number;
  maxHeight?: number;
  qualitySteps?: number[];
};

function getOutputName(fileName: string, mimeType: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  return `${baseName}${extension}`;
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read the selected image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export async function prepareImageUpload(file: File, options: ImageUploadOptions = {}): Promise<PreparedImageUpload> {
  const maxBytes = options.maxBytes ?? 900_000;
  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 1600;
  const qualitySteps = options.qualitySteps ?? [0.82, 0.72, 0.62, 0.52];

  const originalSize = file.size;
  if (!file.type.startsWith("image/")) {
    return {
      file,
      compressed: false,
      originalSize,
      finalSize: originalSize
    };
  }

  const image = await loadImage(file);
  const target = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, maxWidth, maxHeight);
  const shouldResize = target.width !== (image.naturalWidth || image.width) || target.height !== (image.naturalHeight || image.height);
  const shouldCompress = originalSize > maxBytes || shouldResize;

  if (!shouldCompress) {
    return {
      file,
      compressed: false,
      originalSize,
      finalSize: originalSize
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      file,
      compressed: false,
      originalSize,
      finalSize: originalSize
    };
  }

  context.drawImage(image, 0, 0, target.width, target.height);

  let bestBlob: Blob | null = null;
  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) {
      continue;
    }
    bestBlob = blob;
    if (blob.size <= maxBytes) {
      break;
    }
  }

  if (!bestBlob) {
    return {
      file,
      compressed: false,
      originalSize,
      finalSize: originalSize
    };
  }

  const nextFile = new File([bestBlob], getOutputName(file.name || "upload.png", "image/jpeg"), {
    type: "image/jpeg",
    lastModified: file.lastModified
  });

  return {
    file: nextFile,
    compressed: nextFile.name !== file.name || nextFile.size !== file.size,
    originalSize,
    finalSize: nextFile.size
  };
}
