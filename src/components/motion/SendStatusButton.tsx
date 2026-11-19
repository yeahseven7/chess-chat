"use client";

import { useEffect, useRef } from "react";
import { SendHorizonal } from "lucide-react";
import { createSpring, stepSpring, subscribe, targetSpring, clamp } from "@/lib/motion/springs";

export type SendPhase = "idle" | "sending" | "sent";

/**
 * Loading → Success port, wired to real send persistence: label drops away,
 * the pill closes into a spinner, then opens into a green "Sent" pill whose
 * check draws itself. Springs 300 22 (pill), 400 30 (label), 220 20 (check).
 */
export function SendStatusButton({
  phase,
  onClick,
  disabled,
}: {
  phase: SendPhase;
  onClick: () => void;
  disabled?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const spinnerRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<SVGPathElement>(null);
  const rotation = useRef(0);

  const s = useRef({
    w: createSpring(46, "submit"),
    text: createSpring(1, "fade"),
    spin: createSpring(0, "settle"),
    done: createSpring(0, [220, 20]),
    green: createSpring(0, [200, 30]),
    check: createSpring(0, "soft"),
  });

  useEffect(() => {
    return subscribe((dt) => {
      rotation.current += dt * 360 * 1.4;
      [s.current.w, s.current.text, s.current.spin, s.current.done, s.current.green, s.current.check].forEach(
        (spring) => stepSpring(spring, dt)
      );
      const button = buttonRef.current;
      if (button) {
        button.style.width = `${s.current.w.x.toFixed(2)}px`;
        const g = clamp(s.current.green.x, 0, 1);
        button.style.backgroundColor = g > 0.01 ? `rgb(${Math.round(129 - 92 * g)}, ${Math.round(182 - 88 * g)}, ${Math.round(76 - 37 * g)})` : "";
      }
      if (labelRef.current) {
        labelRef.current.style.opacity = clamp(s.current.text.x, 0, 1).toFixed(3);
        labelRef.current.style.transform = `translateY(${((1 - s.current.text.x) * 12).toFixed(2)}px)`;
      }
      if (spinnerRef.current) {
        spinnerRef.current.style.opacity = clamp(s.current.spin.x, 0, 1).toFixed(3);
        spinnerRef.current.style.transform = `rotate(${rotation.current % 360}deg) scale(${(0.6 + 0.4 * clamp(s.current.spin.x, 0, 1)).toFixed(3)})`;
      }
      if (doneRef.current) {
        doneRef.current.style.opacity = clamp(s.current.done.x, 0, 1).toFixed(3);
        doneRef.current.style.transform = `translateY(${((1 - s.current.done.x) * 10).toFixed(2)}px)`;
      }
      if (tickRef.current) {
        tickRef.current.style.strokeDashoffset = `${22 * (1 - clamp(s.current.check.x, 0, 1))}`;
      }
    });
  }, []);

  useEffect(() => {
    const st = s.current;
    if (phase === "sending") {
      targetSpring(st.text, 0);
      targetSpring(st.w, 46);
      targetSpring(st.spin, 1);
      targetSpring(st.done, 0);
      targetSpring(st.green, 0);
      targetSpring(st.check, 0);
    } else if (phase === "sent") {
      targetSpring(st.spin, 0);
      targetSpring(st.w, 96);
      targetSpring(st.done, 1);
      targetSpring(st.green, 1);
      targetSpring(st.check, 1);
    } else {
      targetSpring(st.done, 0);
      targetSpring(st.green, 0);
      targetSpring(st.check, 0);
      targetSpring(st.w, 46);
      targetSpring(st.text, 1);
    }
  }, [phase]);

  return (
    <button
      ref={buttonRef}
      type="submit"
      onClick={onClick}
      disabled={disabled || phase !== "idle"}
      aria-label={phase === "sending" ? "Sending" : phase === "sent" ? "Sent" : "Send message"}
      aria-live="polite"
      className="relative flex h-[46px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent text-[#1b1917] transition-colors disabled:opacity-100"
      style={{ width: 46 }}
    >
      <span ref={labelRef} className="absolute inline-flex will-change-transform">
        <SendHorizonal size={18} aria-hidden="true" />
      </span>
      <span
        ref={spinnerRef}
        aria-hidden="true"
        className="absolute h-6 w-6 rounded-full opacity-0 will-change-transform"
        style={{
          background: "conic-gradient(from 0deg, transparent 0 10%, #e8e6e3 85%, transparent 85%)",
          mask: "radial-gradient(circle closest-side, transparent 68%, #000 72%)",
          WebkitMask: "radial-gradient(circle closest-side, transparent 68%, #000 72%)",
        }}
      />
      <span ref={doneRef} className="absolute inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-[#04140a] opacity-0 will-change-transform">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path ref={tickRef} d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeDasharray: 22, strokeDashoffset: 22 }} />
        </svg>
        Sent
      </span>
    </button>
  );
}
