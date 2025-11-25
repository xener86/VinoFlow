
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { SensoryProfile } from '../types';

interface Props {
  data: SensoryProfile;
}

export const FlavorRadar: React.FC<Props> = ({ data }) => {
  const chartData = [
    { subject: 'Corps', A: data.body, fullMark: 100 },
    { subject: 'Acidité', A: data.acidity, fullMark: 100 },
    { subject: 'Tanins', A: data.tannin, fullMark: 100 },
    { subject: 'Sucre', A: data.sweetness, fullMark: 100 },
    { subject: 'Alcool', A: data.alcohol, fullMark: 100 },
  ];

  return (
    <div className="w-full h-[200px] select-none">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#44403c" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 500 }} 
          />
          <Radar
            name="Vin"
            dataKey="A"
            stroke="#e02424"
            fill="#e02424"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};