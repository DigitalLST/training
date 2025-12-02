import { useRef, useEffect }  from 'react';

type SignaturePadProps = {
  width?: number;
  height?: number;
  strokeStyle?: string;
  backgroundColor?: string;
  onChange?: (dataUrl: string) => void;
};

export default function SignaturePad({
  width = 400,
  height = 180,
  strokeStyle = '#111',
  backgroundColor = '#fff',
  onChange,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // fond blanc
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [backgroundColor]);

  function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if (e instanceof MouseEvent) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    return null;
  }

  function startDrawing(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e: MouseEvent | TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pos = getPos(e);
    const last = lastPos.current;
    if (!pos || !last) return;

    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPos.current = pos;

    if (onChange) {
      const dataUrl = canvas.toDataURL('image/png');
      onChange(dataUrl);
    }
  }

  function stopDrawing(e: MouseEvent | TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    lastPos.current = null;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (onChange) onChange(canvas.toDataURL('image/png'));
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 8,
          background: '#fff',
          touchAction: 'none',
        }}
        onMouseDown={e => startDrawing(e.nativeEvent)}
        onMouseMove={e => draw(e.nativeEvent)}
        onMouseUp={e => stopDrawing(e.nativeEvent)}
        onMouseLeave={e => stopDrawing(e.nativeEvent)}
        onTouchStart={e => startDrawing(e.nativeEvent)}
        onTouchMove={e => draw(e.nativeEvent)}
        onTouchEnd={e => stopDrawing(e.nativeEvent)}
      />
      <button
        type="button"
        onClick={handleClear}
        style={{
          width: 'fit-content',
          padding: '4px 10px',
          fontSize: 12,
          borderRadius: 999,
          border: '1px solid #d1d5db',
          background: '#f9fafb',
          cursor: 'pointer',
          justifySelf: 'flex-end',
        }}
      >
        مسح التوقيع
      </button>
    </div>
  );
}
