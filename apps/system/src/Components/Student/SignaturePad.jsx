import React, { useEffect, useRef, useState } from "react";

const WIDTH = 600;
const HEIGHT = 200;

// A finger or mouse signature. onChange gets a PNG data address, or "" when cleared.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const context = canvasRef.current?.getContext?.("2d");
    if (!context) return;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
  }, []);

  const point = (event) => {
    const box = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) * WIDTH) / (box.width || WIDTH),
      y: ((event.clientY - box.top) * HEIGHT) / (box.height || HEIGHT),
    };
  };

  const start = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    const context = canvasRef.current.getContext("2d");
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    setEmpty(false);
  };

  const move = (event) => {
    if (!drawing.current) return;
    const context = canvasRef.current.getContext("2d");
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    canvasRef.current.getContext("2d").clearRect(0, 0, WIDTH, HEIGHT);
    setEmpty(true);
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label="مساحة التوقيع"
        data-testid="signature-pad"
        style={{ width: "100%", height: "auto", background: "#fff", border: "1px solid #9ca3af", borderRadius: 8, touchAction: "none", display: "block" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <button type="button" onClick={clear} disabled={empty} style={{ marginTop: 6 }}>مسح التوقيع</button>
    </div>
  );
}
