import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '../../store/useUserStore';
import './Roulette.css';

const EUROPEAN_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const BET_OPTIONS = {
    color: [
        { value: 'red', label: '紅色' },
        { value: 'black', label: '黑色' }
    ],
    parity: [
        { value: 'odd', label: '單數' },
        { value: 'even', label: '雙數' }
    ],
    range: [
        { value: 'low', label: '小 1-18' },
        { value: 'high', label: '大 19-36' }
    ],
    dozen: [
        { value: '1', label: '1-12' },
        { value: '2', label: '13-24' },
        { value: '3', label: '25-36' }
    ]
};

function getColor(num: number) {
    if (num === 0) return 'green';
    const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    return reds.includes(num) ? 'red' : 'black';
}

export function RouletteView() {
    const { address, token } = useUserStore();
    const queryClient = useQueryClient();
    const [betAmount, setBetAmount] = useState('10');
    const [betType, setBetType] = useState('color');
    const [betValue, setBetValue] = useState('red');
    const [rotation, setRotation] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [result, setResult] = useState<{ number: number; color: string } | null>(null);
    const wheelRef = useRef<HTMLDivElement>(null);

    const roundQuery = useQuery({
        queryKey: ['roulette-round'],
        queryFn: async () => {
            const res = await fetch('/api/v1/games/roulette/rounds', { method: 'POST' });
            return res.json();
        },
        refetchInterval: 10000,
    });

    const betMutation = useMutation({
        mutationFn: async () => {
            const roundId = roundQuery.data?.data?.round?.id;
            const res = await fetch(`/api/v1/games/roulette/rounds/${roundId}/actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'bet', amount: betAmount, token, payload: { betType, betValue } }),
            });
            return res.json();
        },
        onSuccess: (data) => {
            if (data.data?.result) {
                animateWheel(data.data.result.winningNumber);
            }
        }
    });

    const animateWheel = (winningNumber: number) => {
        setIsSpinning(true);
        const index = EUROPEAN_LAYOUT.indexOf(winningNumber);
        const anglePerSlot = 360 / EUROPEAN_LAYOUT.length;
        const targetAngle = 360 - (index * anglePerSlot);
        const newRotation = rotation + 2520 + (targetAngle - (rotation % 360) + 360) % 360;

        setRotation(newRotation);

        setTimeout(() => {
            setIsSpinning(false);
            setResult({ number: winningNumber, color: getColor(winningNumber) });
        }, 5200);
    };

    const renderWheelLabels = () => {
        const anglePerSlot = 360 / EUROPEAN_LAYOUT.length;
        return EUROPEAN_LAYOUT.map((num, idx) => {
            const angle = idx * anglePerSlot;
            const color = getColor(num);
            return (
                <span
                    key={idx}
                    className={`wheel-label wheel-label-${color}`}
                    style={{
                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-114px) rotate(${-angle}deg)`
                    }}
                >
                    {num}
                </span>
            );
        });
    };

    return (
        <div className="roulette-container space-y-6">
            <h2 className="text-2xl font-bold">ROULETTE</h2>

            <div className="roulette-stage">
                <div className="wheel-container">
                    <div className="wheel-pointer"></div>
                    <div
                        ref={wheelRef}
                        className={`wheel-outer ${isSpinning ? 'is-spinning' : ''}`}
                        style={{ transform: `rotate(${rotation}deg)` }}
                    >
                        {renderWheelLabels()}
                    </div>
                    <div className={`wheel-inner win-${result?.color || ''}`}>
                        {result ? result.number : '?'}
                    </div>
                </div>

                <div className="bet-controls bg-white p-6 rounded-lg shadow border space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Bet Type</label>
                            <select
                                className="w-full border p-2 rounded"
                                value={betType}
                                onChange={(e) => {
                                    setBetType(e.target.value);
                                    if (e.target.value === 'number') setBetValue('0');
                                    else setBetValue(BET_OPTIONS[e.target.value as keyof typeof BET_OPTIONS][0].value);
                                }}
                            >
                                <option value="color">Color</option>
                                <option value="parity">Parity</option>
                                <option value="range">Range</option>
                                <option value="dozen">Dozen</option>
                                <option value="number">Number</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Selection</label>
                            <select
                                className="w-full border p-2 rounded"
                                value={betValue}
                                onChange={(e) => setBetValue(e.target.value)}
                            >
                                {betType === 'number' ? (
                                    Array.from({ length: 37 }, (_, i) => (
                                        <option key={i} value={i}>{i}</option>
                                    ))
                                ) : (
                                    BET_OPTIONS[betType as keyof typeof BET_OPTIONS]?.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="flex space-x-2">
                        <input
                            type="number"
                            className="flex-1 border p-2 rounded"
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                        />
                        <button
                            className="bg-gold text-black px-8 py-2 rounded font-bold hover:opacity-90 disabled:opacity-50"
                            onClick={() => betMutation.mutate()}
                            disabled={betMutation.isPending || isSpinning}
                        >
                            SPIN
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
