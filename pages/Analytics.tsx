import React, { useMemo } from 'react';
import { getWines, getInventory, getConsumptionHistory } from '../services/storageService';
import { WineType } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Wine, TrendingUp, Calendar, MapPin, Grape, Euro } from 'lucide-react';

export const Analytics: React.FC = () => {
  const wines = getWines();
  const inventory = getInventory();
  const history = getConsumptionHistory();

  const stats = useMemo(() => {
    // Total bottles
    const totalBottles = inventory.length;

    // By type
    const byType = wines.reduce((acc, wine) => {
      const count = inventory.filter(b => b.wineId === wine.id).length;
      if (count > 0) {
        acc[wine.type] = (acc[wine.type] || 0) + count;
      }
      return acc;
    }, {} as Record<string, number>);

    // By region
    const byRegion = wines.reduce((acc, wine) => {
      const count = inventory.filter(b => b.wineId === wine.id).length;
      if (count > 0 && wine.region) {
        acc[wine.region] = (acc[wine.region] || 0) + count;
      }
      return acc;
    }, {} as Record<string, number>);

    // By vintage
    const byVintage = wines.reduce((acc, wine) => {
      const count = inventory.filter(b => b.wineId === wine.id).length;
      if (count > 0) {
        acc[wine.vintage] = (acc[wine.vintage] || 0) + count;
      }
      return acc;
    }, {} as Record<number, number>);

    // Consumption last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentConsumption = history.filter(h => new Date(h.date) > thirtyDaysAgo).length;

    return { totalBottles, byType, byRegion, byVintage, recentConsumption };
  }, [wines, inventory, history]);

  const typeData = Object.entries(stats.byType).map(([name, value]) => ({ name, value }));
  const regionData = Object.entries(stats.byRegion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));
  const vintageData = Object.entries(stats.byVintage)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([name, value]) => ({ name, value }));

  const COLORS = {
    [WineType.RED]: '#991b1b',
    [WineType.WHITE]: '#fbbf24',
    [WineType.ROSE]: '#f472b6',
    [WineType.SPARKLING]: '#fde047',
    [WineType.DESSERT]: '#c2410c',
  };

  const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string | number; color?: string }> = ({ 
    icon: Icon, label, value, color = 'text-wine-600' 
  }) => (
    <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-stone-100 dark:bg-stone-800 ${color}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs text-stone-500 uppercase">{label}</p>
          <p className="text-2xl font-bold text-stone-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-24 space-y-6 animate-fade-in">
      <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Statistiques</h2>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wine} label="Bouteilles" value={stats.totalBottles} />
        <StatCard icon={Grape} label="Références" value={wines.length} color="text-purple-600" />
        <StatCard icon={TrendingUp} label="Bues (30j)" value={stats.recentConsumption} color="text-green-600" />
        <StatCard icon={MapPin} label="Régions" value={Object.keys(stats.byRegion).length} color="text-blue-600" />
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* By Type Pie */}
        <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
          <h3 className="text-sm font-bold uppercase text-stone-500 tracking-wider mb-4">Par Type</h3>
          {typeData.length > 0 ? (
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {typeData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[entry.name as WineType] || '#a8a29e'} 
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-stone-500 text-center py-10">Aucune donnée</p>
          )}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {typeData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[item.name as WineType] || '#a8a29e' }}
                />
                <span className="text-stone-600 dark:text-stone-400">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Regions */}
        <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
          <h3 className="text-sm font-bold uppercase text-stone-500 tracking-wider mb-4">Top 5 Régions</h3>
          {regionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={regionData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#78716c', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#991b1b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-stone-500 text-center py-10">Aucune donnée</p>
          )}
        </div>
      </div>

      {/* Vintage Distribution */}
      <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
        <h3 className="text-sm font-bold uppercase text-stone-500 tracking-wider mb-4 flex items-center gap-2">
          <Calendar size={16} /> Répartition par Millésime
        </h3>
        {vintageData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vintageData}>
              <XAxis dataKey="name" tick={{ fill: '#78716c', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip />
              <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-stone-500 text-center py-10">Aucune donnée</p>
        )}
      </div>

      {/* Recent Wines */}
      {wines.length > 0 && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
          <h3 className="text-sm font-bold uppercase text-stone-500 tracking-wider mb-4">Derniers Ajouts</h3>
          <div className="space-y-2">
            {wines
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
              .slice(0, 5)
              .map(wine => {
                const count = inventory.filter(b => b.wineId === wine.id).length;
                return (
                  <div key={wine.id} className="flex items-center justify-between py-2 border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <div>
                      <p className="font-medium text-stone-900 dark:text-white">{wine.name}</p>
                      <p className="text-xs text-stone-500">{wine.vintage} - {wine.region}</p>
                    </div>
                    <span className="text-sm font-bold text-wine-600">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
