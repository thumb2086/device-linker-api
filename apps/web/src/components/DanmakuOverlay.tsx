import { useEffect, useRef, useState, useCallback } from 'react';

interface DanmakuItem {
  id: string;
  text: string;
  color?: string;
}

let danmakuListeners: ((item: DanmakuItem) => void)[] = [];

export function emitDanmaku(text: string, color?: string) {
  const item: DanmakuItem = { id: `${Date.now()}-${Math.random()}`, text, color };
  danmakuListeners.forEach((fn) => fn(item));
}

export default function DanmakuOverlay() {
  const [items, setItems] = useState<DanmakuItem[]>([]);
  const idRef = useRef(0);

  const addItem = useCallback((item: DanmakuItem) => {
    const id = ++idRef.current;
    item.id = `danmaku-${id}`;
    setItems((prev) => [...prev.slice(-20), item]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }, 5000);
  }, []);

  useEffect(() => {
    danmakuListeners.push(addItem);
    return () => {
      danmakuListeners = danmakuListeners.filter((fn) => fn !== addItem);
    };
  }, [addItem]);

  if (items.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-[100] pointer-events-none overflow-hidden" style={{ height: '120px' }}>
      {items.map((item, i) => (
        <div
          key={item.id}
          className="absolute whitespace-nowrap text-sm font-black animate-[danmaku_6s_linear_forwards]"
          style={{
            color: item.color || '#fcc025',
            textShadow: '0 0 10px rgba(252,192,37,0.6), 0 0 20px rgba(0,0,0,0.8)',
            top: `${(i % 3) * 36}px`,
            left: '100%',
          }}
        >
          {item.text}
        </div>
      ))}
      <style>{`
        @keyframes danmaku {
          0% { transform: translateX(0); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateX(calc(-100vw - 200%)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
