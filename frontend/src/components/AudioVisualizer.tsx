'use client';
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  state: 'disconnected' | 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking';
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      const numBars = 32;
      const barWidth = 4;
      const spacing = (width - numBars * barWidth) / (numBars + 1);

      let color = '#64748b';
      let speed = 0.05;

      if (state === 'speaking') {
        color = '#7c3aed';
        speed = 0.15;
      } else if (state === 'thinking') {
        color = '#06b6d4';
        speed = 0.2;
      } else if (state === 'listening') {
        color = '#10b981';
        speed = 0.08;
      }

      phase += speed;

      for (let i = 0; i < numBars; i++) {
        const x = spacing + i * (barWidth + spacing);
        let amplitude = 6;

        if (state === 'speaking') {
          amplitude = Math.sin(phase + i * 0.3) * 28 + Math.cos(phase * 1.5 + i * 0.2) * 15 + 15;
        } else if (state === 'thinking') {
          amplitude = Math.sin(phase + i * 0.5) * 12 + 10;
        } else if (state === 'listening') {
          amplitude = Math.sin(phase + i * 0.1) * 8 + 6;
        }

        amplitude = Math.max(4, Math.min(height - 10, amplitude));

        // Create gradient bar
        const gradient = ctx.createLinearGradient(0, centerY - amplitude / 2, 0, centerY + amplitude / 2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, '#4f46e5');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, centerY - amplitude / 2, barWidth, amplitude, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [state]);

  return (
    <div className="relative w-full h-32 flex items-center justify-center bg-slate-950/60 rounded-xl border border-white/5 overflow-hidden p-4">
      <canvas ref={canvasRef} width={400} height={100} className="w-full h-full" />
      <div className="absolute top-3 right-3 flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/10">
        <span className={`w-2 h-2 rounded-full ${
          state === 'speaking' ? 'bg-purple-500 animate-ping' :
          state === 'thinking' ? 'bg-cyan-400 animate-pulse' :
          state === 'listening' ? 'bg-emerald-400' : 'bg-slate-500'
        }`} />
        <span className="capitalize text-slate-300">{state}</span>
      </div>
    </div>
  );
};
