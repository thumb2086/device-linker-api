import React, { useEffect, useState } from 'react';
import './ChipAnimation.css';

interface ChipAnimationProps {
  amount: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  onComplete?: () => void;
}

export const ChipAnimation: React.FC<ChipAnimationProps> = ({
  amount,
  startX,
  startY,
  endX,
  endY,
  onComplete
}) => {
  const [position, setPosition] = useState({ x: startX, y: startY });
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const duration = 800;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentX = startX + (endX - startX) * easeProgress;
      const currentY = startY + (endY - startY) * easeProgress - Math.sin(progress * Math.PI) * 50;

      setPosition({ x: currentX, y: currentY });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsVisible(false);
        onComplete?.();
      }
    };

    requestAnimationFrame(animate);
  }, [startX, startY, endX, endY, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className="chip-animation"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="chip">
        <span className="chip-amount">{amount}</span>
      </div>
    </div>
  );
};
