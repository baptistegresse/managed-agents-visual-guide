/** Les petits emblèmes dessinés à plat, sans perspective. */

interface SparkProps {
  radius: number;
  color: string;
}

/** Une petite étincelle à huit branches, l'emblème de l'agent. */
export function Spark({ radius, color }: SparkProps) {
  return (
    <g stroke={color} strokeWidth={radius * 0.3} strokeLinecap="round">
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4;
        const length = index % 2 === 0 ? radius : radius * 0.68;
        return (
          <line
            key={index}
            x1={Math.cos(angle) * radius * 0.22}
            y1={Math.sin(angle) * radius * 0.22}
            x2={Math.cos(angle) * length}
            y2={Math.sin(angle) * length}
          />
        );
      })}
    </g>
  );
}
