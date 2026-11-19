"use client";

import { useEffect, type RefObject } from "react";
import { useSpringFrame } from "@/lib/motion/useSpring";

/**
 * Sidebar Collapse port: one spring for the panel width (260 24), one for the
 * toggle arrow (300 22), and one for label opacity/offset. Labels cascade via
 * CSS thresholds on the shared spring value (see .sidebar-shell in motion.css),
 * so no per-frame React renders reach the message list.
 */
export function useSidebarCollapseMotion({
  asideRef,
  arrowRef,
  labelsRef,
  collapsed,
  expandedWidth = 300,
}: {
  asideRef: RefObject<HTMLElement | null>;
  arrowRef: RefObject<HTMLElement | null>;
  labelsRef: RefObject<HTMLElement | null>;
  collapsed: boolean;
  expandedWidth?: number;
}) {
  const setWidth = useSpringFrame(expandedWidth, "soft", (v) => {
    if (asideRef.current) asideRef.current.style.width = `${v}px`;
  });
  const setRotation = useSpringFrame(0, "settle", (v) => {
    if (arrowRef.current) arrowRef.current.style.transform = `rotate(${v}deg)`;
  });
  const setLabel = useSpringFrame(1, "settle", (v) => {
    const host = labelsRef.current;
    if (!host) return;
    host.style.setProperty("--label-opacity", v.toFixed(3));
    host.style.setProperty("--label-x", `${((1 - v) * -10).toFixed(2)}px`);
  });

  useEffect(() => {
    setWidth(collapsed ? 64 : expandedWidth);
    setRotation(collapsed ? 180 : 0);
    setLabel(collapsed ? 0 : 1);
  }, [collapsed, expandedWidth, setWidth, setRotation, setLabel]);
}
