
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { SensoryProfile } from '../types';

interface Overlay {
  data: SensoryProfile;
  color: string;
  name: string;
}

interface Props {
  data?: SensoryProfile;
  overlays?: Overlay[];
}

export const FlavorRadar: React.FC<Props> = ({ data, overlays }) => {
  // Build chart data with all data series
  const subjects = ['Corps', 'Acidité', 'Tanins', 'Sucre', 'Alcool'];
  const keys = ['body', 'acidity', 'tannin', 'sweetness', 'alcohol'] as const;

  const chartData = subjects.map((subject, i) => {
    const point: any = { subject, fullMark: 100 };
    if (data) {
      point.A = data[keys[i]];
    }
    if (overlays) {
      overlays.forEach((overlay, idx) => {
        point[`O${idx}`] = overlay.data[keys[i]];
      });
    }
    return point;
  });

  return (
    <div className="w-full h-[200px] select-none">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#44403c" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 500 }}
          />
          {data && (
            <Radar
              name="Vin"
              dataKey="A"
              stroke="#e02424"
              fill="#e02424"
              fillOpacity={0.3}
            />
          )}
          {overlays?.map((overlay, idx) => (
            <Radar
              key={idx}
              name={overlay.name}
              dataKey={`O${idx}`}
              stroke={overlay.color}
              fill={overlay.color}
              fillOpacity={0.15}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
