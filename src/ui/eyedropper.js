// Photo eyedropper: draw an uploaded image on a canvas, tap or drag to sample a color.
// Samples average a small block of pixels so JPEG noise and texture don't skew the target.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const C = PM.config;

  /**
   * @param {{ canvas: HTMLCanvasElement, container: HTMLElement, onPick: (hex: string) => void }} options
   * @returns {{ load: (file: File) => Promise<void> }}
   */
  function createEyedropper({ canvas, container, onPick }) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let pixels = null; // ImageData of the clean image (without the marker)

    function load(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, C.IMAGE_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          container.hidden = false;
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("That file couldn't be opened as an image."));
        };
        img.src = url;
      });
    }

    function averageAt(x, y) {
      const r = C.SAMPLE_RADIUS;
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
          const i = (py * canvas.width + px) * 4;
          red += pixels.data[i];
          green += pixels.data[i + 1];
          blue += pixels.data[i + 2];
          count++;
        }
      }
      return count ? PM.rgbToHex([red, green, blue].map((v) => v / count / 255)) : null;
    }

    function drawMarker(x, y) {
      ctx.putImageData(pixels, 0, 0);
      const radius = Math.max(8, canvas.width / 80);
      ctx.lineWidth = Math.max(2, radius / 4);
      // White ring inside a black ring: visible on any photo.
      const rings = [
        { color: '#fff', r: radius },
        { color: '#000', r: radius + ctx.lineWidth },
      ];
      for (const { color, r } of rings) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    function sample(event) {
      if (!pixels) return;
      const box = canvas.getBoundingClientRect();
      const x = Math.round(((event.clientX - box.left) / box.width) * canvas.width);
      const y = Math.round(((event.clientY - box.top) / box.height) * canvas.height);
      const hex = averageAt(x, y);
      if (!hex) return;
      drawMarker(x, y);
      onPick(hex);
    }

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      sample(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons) sample(event);
    });

    return { load };
  }

  PM.ui = PM.ui || {};
  PM.ui.createEyedropper = createEyedropper;
})(typeof window !== 'undefined' ? window : globalThis);
