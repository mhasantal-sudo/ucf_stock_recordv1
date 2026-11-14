interface AndroidBlobBridgeSaveHandle {
  saveBase64File?: (dataUrl: string, fileName: string, mimeType: string) => void;
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const bridge = (
    window as unknown as { AndroidBlobBridge?: AndroidBlobBridgeSaveHandle }
  ).AndroidBlobBridge;

  if (bridge?.saveBase64File && typeof FileReader !== 'undefined') {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        bridge.saveBase64File?.(reader.result, fileName, blob.type || '');
      }
    };
    reader.readAsDataURL(blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  window.setTimeout(() => {
    try {
      a.remove();
    } catch {
      // Ignore cleanup errors
    }
    URL.revokeObjectURL(url);
  }, 15000);
}
