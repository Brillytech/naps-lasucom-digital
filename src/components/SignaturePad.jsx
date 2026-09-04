import { Check, Eraser, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Draw a signature with a finger or a mouse.
 *
 * The output is a trimmed, transparent PNG. Both matter: a photograph of a
 * signature on paper carries a white rectangle that sits as a visible box on
 * the letter, and an untrimmed canvas carries a wide empty margin that makes
 * the mark impossible to place against the rule.
 *
 * Strokes are stored as point arrays rather than painted straight onto the
 * canvas, so undo can drop the last one and repaint.
 */

/** Logical drawing surface. The canvas is scaled up for the device. */
const W = 640;
const H = 220;

const INK = "#0b2b63";
const LINE = 3.2;

function pointFrom(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

function SignaturePad({ name, existing, onCancel, onSave, saving }) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const drawingRef = useRef(false);

  const [hasInk, setHasInk] = useState(false);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = canvas.width / W;
    ctx.scale(scale, scale);

    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) {
        // A tap is still a mark -- a dot on an i, a full stop.
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, LINE / 2, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);

      // Curve through the midpoints so a fast gesture does not come out as a
      // run of straight segments.
      for (let i = 1; i < stroke.length - 1; i += 1) {
        const mid = {
          x: (stroke[i].x + stroke[i + 1].x) / 2,
          y: (stroke[i].y + stroke[i + 1].y) / 2,
        };
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
      }

      ctx.lineTo(stroke.at(-1).x, stroke.at(-1).y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    repaint();
  }, [repaint]);

  function start(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    drawingRef.current = true;
    strokesRef.current.push([pointFrom(event, canvasRef.current)]);
    setHasInk(true);
    repaint();
  }

  function move(event) {
    if (!drawingRef.current) return;
    event.preventDefault();

    strokesRef.current.at(-1).push(pointFrom(event, canvasRef.current));
    repaint();
  }

  function end() {
    drawingRef.current = false;
  }

  function undo() {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    repaint();
  }

  function clear() {
    strokesRef.current = [];
    setHasInk(false);
    repaint();
  }

  /**
   * Crop to the ink before exporting.
   *
   * Placement in the PDF works from the image's own bounds, so any empty
   * margin baked into the file becomes a gap between the signature and the
   * rule beneath it.
   */
  function exportTrimmed() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);

    let top = height;
    let left = width;
    let right = 0;
    let bottom = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    if (right <= left || bottom <= top) return null;

    const pad = Math.round(LINE * (width / W));
    left = Math.max(0, left - pad);
    top = Math.max(0, top - pad);
    right = Math.min(width - 1, right + pad);
    bottom = Math.min(height - 1, bottom + pad);

    const out = document.createElement("canvas");
    out.width = right - left + 1;
    out.height = bottom - top + 1;

    out
      .getContext("2d")
      .drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);

    return out.toDataURL("image/png");
  }

  return (
    <div className="asig-backdrop" role="dialog" aria-modal="true" aria-label="Draw signature">
      <div className="asig">
        <header className="asig-head">
          <div>
            <p className="apage-eyebrow">Signature</p>
            <h2>{name}</h2>
          </div>

          <button type="button" className="aicon-btn" onClick={onCancel} title="Close">
            <X size={16} />
          </button>
        </header>

        <p className="asig-note">
          Sign with a finger on a phone, or hold the mouse button down and
          write. It is stored as a transparent image and printed above the rule
          on letters issued from your office.
        </p>

        <div className="asig-surface">
          <canvas
            ref={canvasRef}
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
          />
          <span className="asig-rule" />
          {!hasInk && <span className="asig-hint">Sign here</span>}
        </div>

        {existing && !hasInk && (
          <div className="asig-existing">
            <span>Currently saved</span>
            <img src={existing} alt="Current signature" />
          </div>
        )}

        <div className="asig-actions">
          <button type="button" className="abtn" onClick={undo} disabled={!hasInk}>
            <Undo2 size={14} />
            Undo
          </button>

          <button type="button" className="abtn" onClick={clear} disabled={!hasInk}>
            <Eraser size={14} />
            Clear
          </button>

          <span style={{ flex: 1 }} />

          <button
            type="button"
            className="abtn abtn--primary"
            disabled={!hasInk || saving}
            onClick={() => {
              const png = exportTrimmed();
              if (png) onSave(png);
            }}
          >
            <Check size={14} />
            {saving ? "Saving…" : "Save signature"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignaturePad;
