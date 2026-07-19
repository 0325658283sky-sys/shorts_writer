import { useEffect, useState } from "react";

/**
 * Soft display percent while a job is active:
 * - never goes below the server percent
 * - slowly crawls a few points within the current stage so the bar feels alive
 * - snaps to server percent when inactive
 */
export function useAliveProgress(serverPercent: number, active: boolean): number {
  const [display, setDisplay] = useState(serverPercent);

  useEffect(() => {
    if (!active) {
      setDisplay(serverPercent);
      return;
    }

    setDisplay((current) => Math.max(current, serverPercent));

    const id = window.setInterval(() => {
      setDisplay((current) => {
        const floor = Math.max(0, Math.min(100, serverPercent));
        const ceiling = Math.min(99, floor + 7);
        if (current < floor) return floor;
        if (current >= ceiling) return current;
        return Math.min(ceiling, Math.round((current + 0.2) * 10) / 10);
      });
    }, 450);

    return () => window.clearInterval(id);
  }, [serverPercent, active]);

  return active ? display : serverPercent;
}
