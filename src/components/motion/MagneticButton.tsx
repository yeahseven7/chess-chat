"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createSpring, stepSpring, subscribe, targetSpring } from "@/lib/motion/springs";
import { useReducedMotion } from "@/lib/motion/useSpring";

/**
 * Magnetic Button port: inside the pull radius the button moves a share of
 * the way toward the cursor (springs 170 13 / 220 15 for the label) and both
 * spring home outside it. Pointer-driven only — touch devices and reduced
 * motion get a plain button, so scrolling/tapping is never intercepted.
 */
export function MagneticButton({
  onClick,
  label,
  ariaLabel,
  disabled,
  className = "",
  icon,
}: {
  onClick: () => void;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const s = useRef({
    bx: createSpring(0, [170, 13]),
    by: createSpring(0, [170, 13]),
    lx: createSpring(0, [220, 15]),
    ly: createSpring(0, [220, 15]),
    sc: createSpring(1, "fade"),
  });

  useEffect(() => {
    if (reduce || disabled) {
      if (buttonRef.current) buttonRef.current.style.transform = "";
      if (labelRef.current) labelRef.current.style.transform = "";
      return;
    }
    const button = buttonRef.current;
    if (!button) return;
    const RADIUS = 110;
    let unsub: (() => void) | null = null;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = button.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      const pull = d < RADIUS ? 1 - (d / RADIUS) * 0.35 : 0;
      targetSpring(s.current.bx, dx * 0.28 * pull);
      targetSpring(s.current.by, dy * 0.32 * pull);
      targetSpring(s.current.lx, dx * 0.12 * pull);
      targetSpring(s.current.ly, dy * 0.16 * pull);
      // Activate the shared loop lazily only while the pointer is nearby.
      if (!unsub) {
        unsub = subscribe((dt) => {
          [s.current.bx, s.current.by, s.current.lx, s.current.ly, s.current.sc].forEach(
            (spring) => stepSpring(spring, dt)
          );
          if (buttonRef.current) {
            buttonRef.current.style.transform = `translate(${s.current.bx.x.toFixed(2)}px, ${s.current.by.x.toFixed(2)}px) scale(${s.current.sc.x.toFixed(4)})`;
          }
          if (labelRef.current) {
            labelRef.current.style.transform = `translate(${s.current.lx.x.toFixed(2)}px, ${s.current.ly.x.toFixed(2)}px)`;
          }
        });
      }
    };
    const onLeave = () => {
      [s.current.bx, s.current.by, s.current.lx, s.current.ly].forEach((spring) =>
        targetSpring(spring, 0)
      );
    };
    const onDown = () => targetSpring(s.current.sc, 0.94);
    const onUp = () => {
      s.current.sc.x = 0.94;
      targetSpring(s.current.sc, 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    button.addEventListener("pointerleave", onLeave);
    button.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      button.removeEventListener("pointerleave", onLeave);
      button.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      unsub?.();
    };
  }, [reduce, disabled]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className={`inline-flex items-center justify-center rounded-xl border border-ink-500 p-2 text-cream-300 transition-colors hover:border-accent hover:text-accent will-change-transform ${className}`}
    >
      <span ref={labelRef} className="inline-flex items-center gap-2 will-change-transform">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </span>
    </button>
  );
}
