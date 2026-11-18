"use client";

interface AvatarProps {
  name: string;
  color?: string;
  url?: string | null;
  size?: number;
  online?: boolean;
}

/** Initials avatar with deterministic color (or explicit color). */
export function Avatar({ name, color = "#81b64c", url, size = 36, online }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-[#1b1917] select-none"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
      aria-hidden={false}
      aria-label={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-ink-800 ${
            online ? "bg-accent" : "bg-cream-600"
          }`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        />
      )}
    </span>
  );
}
