"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpring,
  stepSpring,
  subscribe,
  targetSpring,
  tuneSpring,
  type Spring,
  type SpringPreset,
  type SpringTuple,
  prefersReducedMotion,
} from "./springs";

/**
 * Hook around one spring, driven by the shared rAF loop. The `apply` callback
 * writes values straight to a DOM ref — no re-render on animation frames.
 * Returns a setter `(target, snap?)`.
 */
export function useSpringFrame(
  initial: number,
  preset: SpringPreset | SpringTuple,
  apply: (value: number) => void
): (target: number, snap?: boolean) => void {
  const s = useRef<Spring>(createSpring(initial, preset));
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const presetKey = typeof preset === "string" ? preset : null;

  useEffect(() => {
    if (presetKey) tuneSpring(s.current, presetKey);
    return subscribe((dt) => {
      stepSpring(s.current, dt);
      applyRef.current(s.current.x);
    });
  }, [presetKey]);

  return useCallback((target: number, snap = false) => {
    targetSpring(s.current, target, snap);
    if (prefersReducedMotion()) applyRef.current(s.current.x);
  }, []);
}

/** React-state variant for values that need to render in JSX (not per-frame). */
export function useSpringState(initial: number, preset: SpringPreset | SpringTuple = "soft") {
  const [value, setValue] = useState(initial);
  const s = useRef<Spring>(createSpring(initial, preset));
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;

  useEffect(() => {
    return subscribe((dt) => {
      stepSpring(s.current, dt);
      setValueRef.current(s.current.x);
    });
  }, []);

  const set = useCallback((target: number, snap = false) => {
    targetSpring(s.current, target, snap);
    if (prefersReducedMotion()) setValueRef.current(s.current.x);
  }, []);

  return [value, set] as const;
}

/** Tracks the user's reduced-motion preference live. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduce;
}
