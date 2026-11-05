/**
 * The animated pastel lettering used for "ATLAS CORE" on the platform side,
 * reused for the company's name on the company side. The font size shrinks
 * so the whole text fits on one line within maxWidth.
 */
export function RainbowTitle({ text, maxWidth = 188, maxFontSize = 16 }: { text: string; maxWidth?: number; maxFontSize?: number }) {
  const chars = (text || '').split('');
  // each letter takes roughly 0.72em plus letter-spacing of 0.25em
  const fitted = Math.floor(maxWidth / Math.max(1, chars.length * 0.97));
  // Very long names wrap onto two lines rather than becoming unreadably small.
  const wrap = fitted < 8;
  const fontSize = wrap ? Math.max(9, Math.min(maxFontSize, Math.floor((maxWidth * 2) / Math.max(1, chars.length * 0.97)))) : Math.min(maxFontSize, fitted);
  return (
    <>
      <style>{`
        @keyframes rainbowLetterShift {
          0%   { color: #ff9aa2; text-shadow: 0 0 20px #ff9aa2, 0 0 40px #ff9aa260; }
          14%  { color: #ffb7b2; text-shadow: 0 0 20px #ffb7b2, 0 0 40px #ffb7b260; }
          28%  { color: #ffdac1; text-shadow: 0 0 20px #ffdac1, 0 0 40px #ffdac160; }
          42%  { color: #e2f0cb; text-shadow: 0 0 20px #e2f0cb, 0 0 40px #e2f0cb60; }
          57%  { color: #b5ead7; text-shadow: 0 0 20px #b5ead7, 0 0 40px #b5ead760; }
          71%  { color: #c7ceea; text-shadow: 0 0 20px #c7ceea, 0 0 40px #c7ceea60; }
          85%  { color: #f0c7e8; text-shadow: 0 0 20px #f0c7e8, 0 0 40px #f0c7e860; }
          100% { color: #f6c445; text-shadow: 0 0 20px #f6c445, 0 0 40px #f6c44560; }
        }
      `}</style>
      <div title={text} style={{ fontSize, fontWeight: 800, letterSpacing: fontSize * 0.25, display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', justifyContent: 'center', lineHeight: 1.3, whiteSpace: 'nowrap', maxWidth, overflow: 'hidden' }}>
        {/* letters grouped per word, so lines only break between words */}
        {(() => {
          let i = 0;
          return (text || '').toUpperCase().split(' ').map((word, w, words) => (
            <span key={w} style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
              {(word + (w < words.length - 1 ? ' ' : '')).split('').map(ch => {
                const k = i++;
                return (
                  <span key={k} style={{ display: 'inline-block', animation: 'rainbowLetterShift 3s ease-in-out infinite', animationDelay: `${(k % 10) * 0.1}s` }}>
                    {ch === ' ' ? '\u00A0' : ch}
                  </span>
                );
              })}
            </span>
          ));
        })()}
      </div>
    </>
  );
}
