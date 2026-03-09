interface ElephantMascotProps {
  className?: string;
  caption?: string;
}

export function ElephantMascot({ className = "", caption }: ElephantMascotProps) {
  return (
    <div className={`relative isolate aspect-square ${className}`}>
      <div className="absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.22),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(111,184,255,0.18),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] blur-sm" />
      <svg viewBox="0 0 360 360" className="relative h-full w-full elephant-float drop-shadow-[0_40px_70px_rgba(0,0,0,0.35)]" role="img" aria-label="EleMate elephant mascot">
        <defs>
          <linearGradient id="ele-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#122033" />
            <stop offset="100%" stopColor="#0a1220" />
          </linearGradient>
          <linearGradient id="ele-skin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d8e6ff" />
            <stop offset="100%" stopColor="#9bbcf7" />
          </linearGradient>
          <linearGradient id="ele-ear" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7d7e7" />
            <stop offset="100%" stopColor="#d9b5ce" />
          </linearGradient>
          <linearGradient id="ele-shadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5f82c9" />
            <stop offset="100%" stopColor="#4a68a6" />
          </linearGradient>
        </defs>

        <rect x="18" y="18" width="324" height="324" rx="104" fill="url(#ele-bg)" stroke="rgba(255,255,255,0.08)" />
        <circle cx="88" cy="92" r="12" fill="#8de0ff" opacity="0.65" />
        <circle cx="274" cy="70" r="7" fill="#f1f5ff" opacity="0.72" />
        <circle cx="302" cy="118" r="10" fill="#8de0ff" opacity="0.38" />

        <ellipse cx="118" cy="182" rx="56" ry="72" fill="url(#ele-skin)" />
        <ellipse cx="242" cy="182" rx="56" ry="72" fill="url(#ele-skin)" />
        <ellipse cx="118" cy="186" rx="38" ry="50" fill="url(#ele-ear)" opacity="0.92" />
        <ellipse cx="242" cy="186" rx="38" ry="50" fill="url(#ele-ear)" opacity="0.92" />

        <circle cx="180" cy="164" r="76" fill="url(#ele-skin)" />
        <ellipse cx="180" cy="250" rx="90" ry="58" fill="url(#ele-shadow)" />
        <ellipse cx="180" cy="220" rx="80" ry="64" fill="url(#ele-skin)" />
        <path
          d="M173 166c23 0 40 14 40 34 0 12-6 22-15 28v39c0 19-14 33-33 33s-31-13-31-29c0-12 6-20 17-27l16-11v-21c-19-4-32-20-32-41 0-22 16-35 38-35Z"
          fill="url(#ele-skin)"
        />
        <path
          d="M166 238c0 12 10 21 23 21 13 0 23-9 23-21v-19c-7 8-18 13-31 13-5 0-10-1-15-2Z"
          fill="rgba(255,255,255,0.2)"
        />

        <circle cx="152" cy="160" r="8" fill="#1d2b40" />
        <circle cx="208" cy="160" r="8" fill="#1d2b40" />
        <circle cx="149" cy="157" r="2.5" fill="#ffffff" />
        <circle cx="205" cy="157" r="2.5" fill="#ffffff" />
        <path d="M155 194c8 9 22 14 38 14 16 0 30-5 38-14" fill="none" stroke="#20324d" strokeWidth="7" strokeLinecap="round" />
        <circle cx="132" cy="191" r="8" fill="#f9b3c8" opacity="0.78" />
        <circle cx="228" cy="191" r="8" fill="#f9b3c8" opacity="0.78" />

        <path d="M126 251c-9 8-14 21-14 37" fill="none" stroke="#88b0f0" strokeWidth="16" strokeLinecap="round" />
        <path d="M234 251c9 8 14 21 14 37" fill="none" stroke="#88b0f0" strokeWidth="16" strokeLinecap="round" />
        <ellipse cx="180" cy="311" rx="72" ry="12" fill="rgba(7,10,16,0.34)" />

        <path d="M280 228c10 0 18 8 18 18 0 9-8 17-18 17h-24v-35Z" fill="#f5f8ff" opacity="0.9" />
        <text x="290" y="252" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0e1727">
          E
        </text>
      </svg>
      {caption ? (
        <div className="absolute inset-x-6 bottom-5 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-center text-[11px] font-medium tracking-[0.08em] text-white/78 backdrop-blur">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

