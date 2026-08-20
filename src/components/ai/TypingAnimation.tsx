import { useEffect, useState } from 'react';

interface TypingAnimationProps {
  text: string;
  speed?: number;
  className?: string;
  onDone?: () => void;
}

export default function TypingAnimation({
  text,
  speed = 15,
  className = '',
  onDone,
}: TypingAnimationProps) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    let i = 0;
    setDisplayed('');
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onDone]);

  return (
    <span className={className}>
      {displayed}
      <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary-500 animate-pulse align-middle" />
    </span>
  );
}
