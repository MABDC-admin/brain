import React, { useEffect } from 'react';

const COLORS = ['#6366f1','#a855f7','#22c55e','#f97316','#3b82f6','#ec4899','#14b8a6','#fbbf24'];
const SHAPES = ['●','★','♦','▲','■'];

function randomBetween(a, b) { return a + Math.random() * (b - a); }

/**
 * Confetti — burst animation component.
 * Mount it briefly then unmount (it auto-removes after 2.5s).
 * @param {object} props
 * @param {number} props.x - trigger x position (px, relative to parent)
 * @param {number} props.y - trigger y position (px, relative to parent)
 * @param {number} [props.count=22] - number of particles
 * @param {function} props.onDone - called when animation completes
 */
export default function Confetti({ x = 160, y = 200, count = 22, onDone }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    shape: SHAPES[i % SHAPES.length],
    angle: randomBetween(0, 360),
    distance: randomBetween(40, 110),
    size: randomBetween(10, 18),
    duration: randomBetween(0.6, 1.1),
    delay: randomBetween(0, 0.15),
  }));

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 1400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-[200]">
      {particles.map(p => {
        const dx = Math.cos((p.angle * Math.PI) / 180) * p.distance;
        const dy = Math.sin((p.angle * Math.PI) / 180) * p.distance - 40;
        return (
          <div key={p.id}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              color: p.color,
              fontSize: p.size,
              animation: `confettiBurst ${p.duration}s ${p.delay}s ease-out forwards`,
              '--dx': `${dx}px`,
              '--dy': `${dy}px`,
              lineHeight: 1,
            }}>
            {p.shape}
          </div>
        );
      })}
      <style>{`
        @keyframes confettiBurst {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.3) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
