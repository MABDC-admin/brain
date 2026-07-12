import { useState, useEffect, useRef } from 'react';

/**
 * useCountUp — animates a number from 0 to `target` over `duration` ms.
 * Uses ease-out cubic easing. Restarts whenever `target` changes.
 */
export function useCountUp(target, duration = 900) {
  const [count,   setCount]   = useState(0);
  const frameRef  = useRef(null);
  const startRef  = useRef(null);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
    startRef.current  = null;
    setCount(0);

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed  = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * targetRef.current));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return count;
}
