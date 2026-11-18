/** Custom SVG glyphs for the six reaction categories (not emoji). */
export function GlyphPath({ glyph }: { glyph: string }) {
  switch (glyph) {
    case "star":
      return (
        <path
          d="M12 2.6l2.86 5.8 6.4.93-4.63 4.5 1.1 6.36L12 17.9l-5.73 3.02 1.1-6.36-4.63-4.5 6.4-.93L12 2.6z"
          fill="currentColor"
        />
      );
    case "thumb":
      return (
        <path
          d="M2 10.5a1.5 1.5 0 0 1 1.5-1.5H6a1 1 0 0 0 1-1V5.2C7 3.4 8.1 2 9.9 2c.9 0 1.6.7 1.7 1.6l.3 3.4H19a2.4 2.4 0 0 1 2.4 2.9l-1.5 8A2.4 2.4 0 0 1 17.6 20h-8.2a2 2 0 0 1-1.4-.6l-4.4-4.7A2.4 2.4 0 0 1 2 12.4v-1.9z"
          fill="currentColor"
        />
      );
    case "x":
      return (
        <path
          d="M6.4 5 12 10.6 17.6 5 21 8.4 15.4 14 21 19.6 17.6 23 12 17.4 6.4 23 3 19.6 8.6 14 3 8.4 6.4 5z"
          fill="currentColor"
          transform="translate(0,-1) scale(0.9)"
        />
      );
    case "!":
      return <path d="M10.2 3h3.6v10.4h-3.6zM10.2 17h3.6v3.6h-3.6z" fill="currentColor" />;
    case "?":
      return (
        <path
          d="M12 2.8c3.6 0 6.2 2.2 6.2 5.3 0 2.1-1.1 3.6-2.8 4.9-1.1.8-1.6 1.5-1.6 2.9h-3.9c.1-3 1.9-4.2 3.1-5.1 1-.8 1.7-1.7 1.7-3.1 0-1.4-1.3-2.2-3.2-2.2-2 0-3.3.9-4.2 2.6L7 10C8.1 6.5 10 2.8 12 2.8zM8.3 19h3.9v3.4H8.3z"
          fill="currentColor"
        />
      );
    case "??":
      return (
        <path
          d="M7.6 2.8c3 0 5.1 1.9 5.1 4.5 0 1.8-.9 3.1-2.4 4.2-1 .8-1.4 1.4-1.4 2.6h-3.4c.1-2.6 1.6-3.6 2.7-4.4.9-.7 1.4-1.4 1.4-2.6 0-1.2-1.1-1.9-2.7-1.9-1.7 0-2.8.8-3.6 2.3L2.5 9.4C3.5 6.3 5.3 2.8 7.6 2.8zM16.8 2.8c3 0 5.1 1.9 5.1 4.5 0 1.8-.9 3.1-2.4 4.2-1 .8-1.4 1.4-1.4 2.6h-3.4c.1-2.6 1.6-3.6 2.7-4.4.9-.7 1.4-1.4 1.4-2.6 0-1.2-1.1-1.9-2.7-1.9-1.7 0-2.8.8-3.6 2.3L11.5 9.4C12.6 6.3 14.5 2.8 16.8 2.8zM4.3 19h3.3v3.2H4.3zM13.5 19h3.3v3.2h-3.3z"
          fill="currentColor"
        />
      );
    default:
      return <path d="M12 3l9 18H3z" fill="currentColor" />;
  }
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="ChessChat logo">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#81b64c" />
      {/* speech bubble */}
      <path
        d="M24 10c-8 0-14.5 5-14.5 11.1 0 6.4 6.2 11 13.6 11 1.6 0 3.2-.3 4.6-.8l5.3 3.7-1.5-6.1c2.6-2.2 4.1-5.2 4.1-8.4C35.6 15 31.8 10 24 10z"
        fill="#1b1917"
      />
      {/* exclamation mark = Great/annotation */}
      <rect x="21.6" y="15.5" width="4.8" height="8.6" rx="1.2" fill="#81b64c" />
      <circle cx="24" cy="27.6" r="2.2" fill="#81b64c" />
    </svg>
  );
}
