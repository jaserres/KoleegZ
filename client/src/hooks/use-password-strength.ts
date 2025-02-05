
import { useState, useEffect } from 'react';

export function usePasswordStrength(password: string) {
  const [strength, setStrength] = useState({
    score: 0,
    message: ''
  });

  useEffect(() => {
    let score = 0;
    
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const messages = [
      'Muy débil',
      'Débil',
      'Medio',
      'Fuerte',
      'Muy fuerte'
    ];

    setStrength({
      score,
      message: messages[score - 1] || 'Muy débil'
    });
  }, [password]);

  return strength;
}
