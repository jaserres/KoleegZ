import confetti from 'canvas-confetti';
import { useCallback } from 'react';

export function useConfetti() {
  const trigger = useCallback(() => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    // Start with a burst of confetti
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: ['#FF5733', '#33FF57', '#3357FF', '#FF33F5']
    });

    // Then a wider burst
    fire(0.2, {
      spread: 60,
      colors: ['#FFD700', '#FF69B4', '#00CED1', '#9370DB']
    });

    // Finally, a shower of confetti
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#FFB6C1', '#98FB98', '#87CEEB', '#DDA0DD']
    });

    // And a final small burst for good measure
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: ['#FFA07A', '#98FB98', '#87CEFA', '#F08080']
    });
  }, []);

  return { trigger };
}
