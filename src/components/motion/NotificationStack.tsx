"use client";

/**
 * @author: @dorianbaffier
 * @description: Notification Stack (animation logic ported verbatim, MIT)
 * @license: MIT
 * @website: https://kokonutui.com
 * @source: https://kokonutui.com/docs/cards/notification-stack
 *
 * Colors, radii and typography adapted to ChessChat's dark design system.
 * Stacked notifications fan out on hover/focus and swipe away with a critically
 * damped snapback spring (520 stiffness, damping = 2*sqrt(520)).
 */
import { Bell, LogIn, MessageSquare, Star, UserPlus, X } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface StackNotification {
  id: string;
  app: string;
  title: string;
  body: string;
  time: string;
  icon?: ReactNode;
}

const PEEK = 10;
const VISIBLE_BEHIND = 2;
const GAP = 8;
const FALLBACK_HEIGHT = 76;
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.11;
const AXIS_LOCK = 6;
const SPRING_STIFFNESS = 520;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS);
const FLIGHT_MIN_SPEED = 1400;
const FLIGHT_ACCEL = 4200;
const VELOCITY_WINDOW_MS = 80;
const EXIT_MS = 200;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  dx: number;
  axis: "x" | "y" | null;
  samples: { t: number; x: number }[];
}

const opacityFor = (x: number) => Math.max(1 - Math.abs(x) / 240, 0.3);

function releaseVelocity(samples: { t: number; x: number }[]) {
  const last = samples.at(-1);
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]!;
    if (last.t - sample.t > VELOCITY_WINDOW_MS) break;
    first = sample;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

function dismissDirection(dx: number, velocity: number): 1 | -1 | 0 {
  const flick = Math.abs(velocity) > DISMISS_VELOCITY && Math.sign(velocity) === Math.sign(dx);
  if (Math.abs(dx) < DISMISS_DISTANCE && !flick) return 0;
  return (dx === 0 ? velocity : dx) > 0 ? 1 : -1;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface NotificationStackProps {
  notifications: StackNotification[];
  onDismiss?: (id: string) => void;
  onOpen?: (id: string) => void;
  className?: string;
}

export default function NotificationStack({
  notifications,
  onDismiss,
  onOpen,
  className,
}: NotificationStackProps) {
  const [items, setItems] = useState(notifications);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());

  const listRef = useRef<HTMLOListElement>(null);
  const swipeRefs = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const timers = useRef<number[]>([]);
  const lastY = useRef(new Map<string, number>());
  const swipeX = useRef(new Map<string, number>());
  const frames = useRef(new Map<string, number>());
  const dismissed = useRef(new Set<string>());
  const stopListening = useRef<(() => void) | null>(null);

  useEffect(() => {
    setItems(notifications);
    dismissed.current.clear();
  }, [notifications]);

  useEffect(() => {
    const pending = timers.current;
    const running = frames.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      running.forEach((frame) => cancelAnimationFrame(frame));
      stopListening.current?.();
    };
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = (entries: { id?: string; height: number }[]) => {
      setHeights((prev) => {
        let next = prev;
        for (const { id, height } of entries) {
          if (id && height && prev[id] !== height) {
            next = next === prev ? { ...prev } : next;
            next[id] = height;
          }
        }
        return next;
      });
    };
    const cards = Array.from(list.children) as HTMLElement[];
    measure(cards.map((card) => ({ id: card.dataset.id, height: card.offsetHeight })));
    const observer = new ResizeObserver((entries) => {
      measure(
        entries.map((entry) => ({
          id: (entry.target as HTMLElement).dataset.id,
          height: Math.round(entry.borderBoxSize[0]?.blockSize ?? 0),
        }))
      );
    });
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [items.length]);

  const expanded = (hovered || focused || pinned) && items.length > 1;
  const heightOf = (id: string) => heights[id] ?? FALLBACK_HEIGHT;
  const laidOut = items.filter((item) => !leaving.has(item.id));
  const frontHeight = laidOut[0] ? heightOf(laidOut[0]!.id) : 0;
  const stackHeight = expanded
    ? laidOut.reduce((sum, item) => sum + heightOf(item.id), 0) + Math.max(laidOut.length - 1, 0) * GAP
    : frontHeight + Math.min(Math.max(laidOut.length - 1, 0), VISIBLE_BEHIND) * PEEK;

  const offsets: number[] = [];
  let running = 0;
  for (const item of laidOut) {
    offsets.push(running);
    running += heightOf(item.id) + GAP;
  }

  const stopFrame = (id: string) => {
    const frame = frames.current.get(id);
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frames.current.delete(id);
    }
  };
  const paint = (id: string, x: number) => {
    swipeX.current.set(id, x);
    const node = swipeRefs.current.get(id);
    if (node) {
      node.style.transition = "none";
      node.style.transform = x === 0 ? "" : `translateX(${x}px)`;
      node.style.opacity = x === 0 ? "" : `${opacityFor(x)}`;
    }
  };
  const run = (id: string, step: (dt: number) => boolean, onDone?: () => void) => {
    stopFrame(id);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (step(dt)) {
        frames.current.delete(id);
        onDone?.();
        return;
      }
      frames.current.set(id, requestAnimationFrame(tick));
    };
    frames.current.set(id, requestAnimationFrame(tick));
  };
  const snapBack = (id: string, velocity: number) => {
    let x = swipeX.current.get(id) ?? 0;
    let v = velocity * 1000;
    if (prefersReducedMotion()) {
      paint(id, 0);
      return;
    }
    run(id, (dt) => {
      const force = -SPRING_STIFFNESS * x - SPRING_DAMPING * v;
      v += force * dt;
      x += v * dt;
      if (Math.abs(x) < 0.5 && Math.abs(v) < 10) {
        paint(id, 0);
        return true;
      }
      paint(id, x);
      return false;
    });
  };
  const finishDismiss = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    lastY.current.delete(id);
    swipeX.current.delete(id);
    setLeaving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onDismiss?.(id);
  };
  const dismiss = (id: string, direction: 1 | -1, velocity = 0) => {
    if (dismissed.current.has(id)) return;
    dismissed.current.add(id);
    setLeaving((prev) => new Set(prev).add(id));
    const node = swipeRefs.current.get(id);
    if (node?.contains(document.activeElement)) {
      const at = laidOut.findIndex((item) => item.id === id);
      const next = laidOut[at + 1] ?? laidOut[at - 1];
      const target = next ? swipeRefs.current.get(next.id)?.querySelector("article") : listRef.current;
      target?.focus();
    }
    if (!node || prefersReducedMotion()) {
      stopFrame(id);
      if (node) {
        node.style.transition = `opacity ${EXIT_MS}ms ${EASE_OUT}`;
        node.style.opacity = "0";
      }
      timers.current.push(window.setTimeout(() => finishDismiss(id), EXIT_MS));
      return;
    }
    const distance = node.offsetWidth * 1.1;
    let x = swipeX.current.get(id) ?? 0;
    let speed = Math.max(Math.abs(velocity) * 1000, FLIGHT_MIN_SPEED);
    run(
      id,
      (dt) => {
        speed += FLIGHT_ACCEL * dt;
        x += direction * speed * dt;
        const done = Math.abs(x) >= distance;
        paint(id, done ? direction * distance : x);
        node.style.opacity = `${Math.max(1 - Math.abs(x) / distance, 0)}`;
        return done;
      },
      () => finishDismiss(id)
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, index: number, id: string) => {
    if (drag.current || leaving.has(id) || (!expanded && index > 0)) return;
    suppressClick.current = false;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    stopFrame(id);
    const { pointerId } = event;
    const release = (up: globalThis.PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      stopListening.current?.();
      if (drag.current?.pointerId === pointerId) {
        drag.current = null;
        if (swipeX.current.get(id)) snapBack(id, 0);
      }
    };
    stopListening.current?.();
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    stopListening.current = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      stopListening.current = null;
    };
    drag.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: swipeX.current.get(id) ?? 0,
      dx: 0,
      axis: null,
      samples: [],
    };
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>, id: string) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (current.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
      current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (current.axis === "x") event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (current.axis !== "x") return;
    current.dx = current.originX + dx;
    current.samples.push({ t: event.timeStamp, x: current.dx });
    if (current.samples.length > 12) current.samples.shift();
    paint(id, current.dx);
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>, id: string) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.axis !== "x") {
      if (swipeX.current.get(id)) snapBack(id, 0);
      return;
    }
    suppressClick.current = true;
    const velocity = releaseVelocity(current.samples);
    const direction = dismissDirection(current.dx, velocity);
    if (direction === 0) {
      snapBack(id, velocity);
      return;
    }
    dismiss(id, direction, Math.sign(velocity) === direction ? velocity : 0);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (event.repeat) return;
      dismiss(id, 1);
    }
  };

  return (
    <div
      className={cn("w-full", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
      }}
      onFocus={() => setFocused(true)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
    >
      <div className="mb-3 flex h-7 items-center justify-between px-1">
        <p className="text-sm font-semibold text-cream-100">
          Notifications
          <span className="ml-2 text-xs tabular-nums text-cream-500">{laidOut.length}</span>
        </p>
        {laidOut.length > 1 && (
          <button
            aria-expanded={expanded}
            className="rounded-md px-2 py-1 text-xs text-cream-500 transition-colors duration-150 hover:bg-ink-700 hover:text-cream-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setPinned((prev) => !prev)}
            type="button"
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        )}
      </div>

      <ol
        aria-label="Notifications"
        className="relative outline-none transition-[height] duration-300 motion-reduce:transition-none"
        ref={listRef}
        style={{ height: stackHeight }}
        tabIndex={-1}
      >
        {items.map((item) => {
          const index = laidOut.findIndex((card) => card.id === item.id);
          const isLeaving = index === -1;
          const depth = Math.max(index, 0);
          const hiddenBehind = !(expanded || depth <= VISIBLE_BEHIND);
          const scale = expanded || isLeaving ? 1 : 1 - depth * 0.05;
          const restingY = expanded
            ? offsets[depth] ?? 0
            : frontHeight + depth * PEEK - heightOf(item.id) * scale;
          const y = isLeaving ? (lastY.current.get(item.id) ?? 0) : restingY;
          if (!isLeaving) lastY.current.set(item.id, restingY);

          return (
            <li
              key={item.id}
              data-id={item.id}
              className="absolute inset-x-0 top-0 origin-top transition-[transform,opacity] duration-300 motion-reduce:transition-opacity"
              style={{
                transform: `translateY(${y}px) scale(${scale})`,
                opacity: hiddenBehind ? 0 : 1,
                zIndex: items.length - depth,
                pointerEvents: hiddenBehind ? "none" : undefined,
              }}
            >
              <div
                className="touch-pan-y"
                onLostPointerCapture={(event) => {
                  if (event.target === event.currentTarget) handlePointerUp(event, item.id);
                }}
                onPointerCancel={(event) => handlePointerUp(event, item.id)}
                onPointerDown={(event) => handlePointerDown(event, depth, item.id)}
                onPointerMove={(event) => handlePointerMove(event, item.id)}
                onPointerUp={(event) => handlePointerUp(event, item.id)}
                ref={(node) => {
                  if (node) swipeRefs.current.set(item.id, node);
                  else swipeRefs.current.delete(item.id);
                }}
              >
                <article
                  aria-label={`${item.app}: ${item.title}. ${item.body}`}
                  className={cn(
                    "group/card relative flex select-none gap-3 rounded-xl border border-ink-500 bg-ink-700 p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    !expanded && depth === 0 && laidOut.length > 1 && "cursor-pointer"
                  )}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (!expanded) {
                      onOpen?.(item.id);
                      setPinned(true);
                    }
                  }}
                  onKeyDown={(event) => handleCardKeyDown(event, item.id)}
                  tabIndex={hiddenBehind ? -1 : 0}
                >
                  <NotificationContent
                    item={item}
                    muted={!expanded && depth > 0}
                    onDismiss={() => dismiss(item.id, 1)}
                    tabbable={!hiddenBehind}
                  />
                </article>
              </div>
            </li>
          );
        })}
      </ol>

      {laidOut.length === 0 && (
        <p className="py-6 text-center text-sm text-cream-500">You&apos;re all caught up.</p>
      )}
    </div>
  );
}

const TYPE_ICON: Record<string, typeof Bell> = {
  friend_request: UserPlus,
  friend_accepted: UserPlus,
  message: MessageSquare,
  group_invite: LogIn,
  reply: MessageSquare,
};

function NotificationContent({
  item,
  muted,
  tabbable,
  onDismiss,
}: {
  item: StackNotification;
  muted: boolean;
  tabbable: boolean;
  onDismiss: () => void;
}) {
  const Icon = TYPE_ICON[item.app] ?? Star;
  return (
    <>
      <div className={cn("flex min-w-0 flex-1 gap-3 transition-opacity duration-200", muted && "opacity-0")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-dark/60 text-accent">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-cream-100">{item.title}</p>
            <span className="shrink-0 text-[10px] tabular-nums text-cream-500">{item.time}</span>
          </div>
          <p className="line-clamp-2 text-xs text-cream-500">{item.body}</p>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Dismiss ${item.title}`}
        className={cn(
          "absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-ink-500 bg-ink-800 text-cream-500 opacity-0 transition-opacity duration-150 hover:text-cream-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover/card:opacity-100",
          muted && "hidden"
        )}
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        tabIndex={tabbable ? 0 : -1}
      >
        <X className="h-3 w-3" />
      </button>
    </>
  );
}
