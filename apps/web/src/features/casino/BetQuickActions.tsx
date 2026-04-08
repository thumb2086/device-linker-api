import React from 'react';

type Props = {
  amount: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxBet?: number;
};

const PRESETS = [100, 1000, 10000];

export const BetQuickActions: React.FC<Props> = ({ amount, onChange, disabled = false, maxBet = 1_000_000 }) => {
  return (
    <div className="quick-bet-row">
      {PRESETS.map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(String(value))}
          className={`quick-bet-btn ${amount === String(value) ? 'active' : ''}`}
        >
          {value.toLocaleString()}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(String(maxBet))}
        className="quick-bet-btn allin"
      >
        ALL-IN
      </button>
    </div>
  );
};
