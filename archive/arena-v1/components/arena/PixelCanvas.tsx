"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { EMPTY_CODE, HEX_BY_CODE, NO_OWNER } from "@/lib/config";
import type { PublicWorld } from "@/lib/world/types";

interface PixelCanvasProps {
  world: PublicWorld;
  highlightedSlot: number | null;
}

interface HoveredCell {
  x: number;
  y: number;
}

const CELL_PIXELS = 10;
const EMPTY_COLOR = "#12141a";
const DIMMED_ALPHA = 0.18;

function drawWorld(context: CanvasRenderingContext2D, world: PublicWorld, highlightedSlot: number | null): void {
  const { size, colors, owners } = world;
  context.globalAlpha = 1;
  context.fillStyle = EMPTY_COLOR;
  context.fillRect(0, 0, size * CELL_PIXELS, size * CELL_PIXELS);
  for (let index = 0; index < colors.length; index += 1) {
    const code = colors[index];
    if (code === EMPTY_CODE) continue;
    const isDimmed = highlightedSlot !== null && owners[index] !== highlightedSlot;
    context.globalAlpha = isDimmed ? DIMMED_ALPHA : 1;
    context.fillStyle = HEX_BY_CODE[code] ?? EMPTY_COLOR;
    context.fillRect((index % size) * CELL_PIXELS, Math.floor(index / size) * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS);
  }
  context.globalAlpha = 1;
}

/** Le canvas partagé, avec les zones en attente de décision du modérateur. */
export function PixelCanvas({ world, highlightedSlot }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<HoveredCell | null>(null);
  const { size } = world;

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (context) drawWorld(context, world, highlightedSlot);
  }, [world, highlightedSlot]);

  const handleMove = (event: MouseEvent<HTMLCanvasElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * size);
    const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * size);
    setHovered(x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null);
  };

  const hoveredOwner = hovered ? world.owners[hovered.y * size + hovered.x] : NO_OWNER;
  const hoveredAgent = world.agents.find((agent) => agent.slot === hoveredOwner);

  return (
    <div className="flex w-full max-w-[min(100%,calc(100vh-11rem))] flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-line bg-panel">
        <canvas
          ref={canvasRef}
          width={size * CELL_PIXELS}
          height={size * CELL_PIXELS}
          className="pixelated block h-full w-full"
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
          aria-label={`Canvas partagé de ${size} par ${size} pixels`}
        />
        {world.approvals.map((approval) => (
          <div
            key={approval.id}
            className="pointer-events-none absolute animate-pulse border-2 border-dashed border-warn"
            style={{
              left: `${(approval.box.minX / size) * 100}%`,
              top: `${(approval.box.minY / size) * 100}%`,
              width: `${((approval.box.maxX - approval.box.minX + 1) / size) * 100}%`,
              height: `${((approval.box.maxY - approval.box.minY + 1) / size) * 100}%`,
            }}
          />
        ))}
      </div>
      <p className="h-5 font-mono text-xs text-muted">
        {hovered
          ? `x ${hovered.x}, y ${hovered.y} · ${hoveredAgent ? `peint par ${hoveredAgent.name}` : "vide"}`
          : `${size} × ${size} pixels · survole pour voir qui a peint quoi`}
      </p>
    </div>
  );
}
