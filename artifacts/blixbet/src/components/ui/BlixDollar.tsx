/* ─── Blixbet B$ Currency Icon ──────────────────────────────────────────────
   Hexagonal coin icon matching the reference F$ design — with "B" and "$"
   rendered inside the same hex outline. Gold gradient used site-wide.
   The hex outline path is taken verbatim from the reference site SVG.
────────────────────────────────────────────────────────────────────────── */

const HEX_OUTLINE =
  "M14.975 5.35 8.836 1.788a.67.67 0 0 0-.672 0L2.025 5.351a.677.677 0 0 0-.336.585v7.128c0 .241.128.465.336.585l6.139 3.564a.67.67 0 0 0 .672 0l6.139-3.564a.677.677 0 0 0 .336-.585V5.936a.677.677 0 0 0-.336-.585ZM9.509.616a2.009 2.009 0 0 0-2.018 0L1.353 4.18a2.032 2.032 0 0 0-1.01 1.757v7.128c0 .725.385 1.395 1.01 1.757l6.138 3.564a2.009 2.009 0 0 0 2.018 0l6.139-3.564a2.031 2.031 0 0 0 1.009-1.757V5.936c0-.725-.385-1.395-1.01-1.757L9.51.615Z";

/* Gold gradient B$ coin — the site-wide currency icon */
export function BlixDollarGold({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 19 / 17);
  const id = "bdg_gold";
  return (
    <svg
      width={size}
      height={h}
      viewBox="0.34 0.34 16.31 18.31"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   style={{ stopColor: "rgb(251,207,58)", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "rgb(252,159,19)", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <path fillRule="evenodd" clipRule="evenodd" fill={`url(#${id})`} d={HEX_OUTLINE} />
      <text
        x="8.5" y="10.0"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#fff"
        fontSize="6"
        fontWeight="bold"
        fontFamily="'Arial Black', Arial, sans-serif"
        letterSpacing="-0.3"
      >
        B$
      </text>
    </svg>
  );
}

/* Alias — BlixDollarGray now renders in gold site-wide */
export function BlixDollarGray({ size = 17 }: { size?: number }) {
  return <BlixDollarGold size={size} />;
}
