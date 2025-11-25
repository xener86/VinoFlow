
import React, { useEffect, useState } from 'react';
import { getInventory } from '../services/storageService';
import { CellarWine, SensoryProfile } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, TooltipProps } from 'recharts';
import { TrendingUp, Calendar, Droplet, Lightbulb, BookOpen } from 'lucide-react';
import { generateEducationalContent } from '../services/geminiService';

export const Analytics: React.FC = () => {
  const [inventory, setInventory] = useState<CellarWine[]>([]);
  const [totalBottles, setTotalBottles] = useState(0);
  const [avgProfile, setAvgProfile] = useState<SensoryProfile | null>(null);
  const [maturityData, setMaturityData] = useState<any[]>([]);
  const [typeData, setTypeData] = useState<any[]>([]);
  
  // Educational/Insight State
  const [dailyFact, setDailyFact] = useState<string | null>(null);
  const [loadingFact, setLoadingFact] = useState(false);

  useEffect(() => {
    const wines = getInventory();
    setInventory(wines);
    
    const total = wines.reduce((acc, w) => acc + w.inventoryCount, 0);
    setTotalBottles(total);

    if (wines.length > 0) {
      const profileSum = wines.reduce((acc, w) => ({
        body: acc.body + w.sensoryProfile.body,
        acidity: acc.acidity + w.sensoryProfile.acidity,
        tannin: acc.tannin + w.sensoryProfile.tannin,
        sweetness: acc.sweetness + w.sensoryProfile.sweetness,
        alcohol: acc.alcohol + w.sensoryProfile.alcohol,
        flavors: []
      }), { body: 0, acidity: 0, tannin: 0, sweetness: 0, alcohol: 0, flavors: [] });

      setAvgProfile({
        body: Math.round(profileSum.body / wines.length),
        acidity: Math.round(profileSum.acidity / wines.length),
        tannin: Math.round(profileSum.tannin / wines.length),
        sweetness: Math.round(profileSum.sweetness / wines.length),
        alcohol: Math.round(profileSum.alcohol / wines.length),
        flavors: []
      });
    }

    const currentYear = new Date().getFullYear();
    const maturityDistribution = wines.reduce((acc: any, w) => {
      let peakStart = w.vintage;
      if (w.type === 'RED') peakStart += 5;
      else if (w.type === 'WHITE') peakStart += 2;
      else peakStart += 1;

      let status = "Garde";
      if (currentYear > peakStart + 5) status = "Boire Vite";
      else if (currentYear >= peakStart) status = "À Boire";
      
      acc[status] = (acc[status] || 0) + w.inventoryCount;
      return acc;
    }, {});
    
    setMaturityData([
      { name: 'Garde', value: maturityDistribution['Garde'] || 0, color: '#78716c' }, // Stone-500
      { name: 'À Boire', value: maturityDistribution['À Boire'] || 0, color: '#16a34a' }, // Green-600
      { name: 'Boire Vite', value: maturityDistribution['Boire Vite'] || 0, color: '#dc2626' }, // Red-600
    ]);

    const byType = wines.reduce((acc: any, w) => {
      acc[w.type] = (acc[w.type] || 0) + w.inventoryCount;
      return acc;
    }, {});
    
    const typeColors: any = { 'RED': '#9b1c1c', 'WHITE': '#fcd34d', 'ROSE': '#f9a8d4', 'SPARKLING': '#93c5fd', 'DESSERT': '#fbbf24', 'FORTIFIED': '#78350f' };
    const typeLabels: any = { 'RED': 'Rouge', 'WHITE': 'Blanc', 'ROSE': 'Rosé', 'SPARKLING': 'Bulles', 'DESSERT': 'Dessert', 'FORTIFIED': 'Fortifié' };

    setTypeData(Object.keys(byType).map(key => ({
      name: typeLabels[key] || key,
      value: byType[key],
      color: typeColors[key] || '#57534e'
    })));

  }, []);

  const handleGetFact = async () => {
    if (inventory.length === 0) return;
    setLoadingFact(true);
    try {
      const randomWine = inventory[Math.floor(Math.random() * inventory.length)];
      const fact = await generateEducationalContent(randomWine.name);
      setDailyFact(fact);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFact(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-2 rounded shadow-xl text-xs">
          <p className="text-stone-900 dark:text-white font-bold">{payload[0].payload.name}</p>
          <p className="text-wine-600 dark:text-wine-400">{payload[0].value} Bouteilles</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <h2 className="text-3xl font-serif text-stone-900 dark:text-white mb-6">Analyses de la Cave</h2>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex flex-col justify-between h-28 shadow-sm">
           <div className="flex justify-between items-start text-stone-500">
             <span className="text-xs uppercase font-bold tracking-wider">Total</span>
             <Droplet size={16} />
           </div>
           <div>
             <span className="text-3xl font-bold text-stone-900 dark:text-white">{totalBottles}</span>
             <span className="text-xs text-stone-500 ml-1">Bouteilles</span>
           </div>
        </div>
        
        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex flex-col justify-between h-28 shadow-sm">
           <div className="flex justify-between items-start text-stone-500">
             <span className="text-xs uppercase font-bold tracking-wider">Rotation</span>
             <TrendingUp size={16} />
           </div>
           <div>
             <span className="text-3xl font-bold text-wine-600 dark:text-wine-500">12%</span>
             <span className="text-xs text-stone-500 ml-1">ce mois</span>
           </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex flex-col justify-between h-28 shadow-sm">
           <div className="flex justify-between items-start text-stone-500">
             <span className="text-xs uppercase font-bold tracking-wider">À Boire</span>
             <Calendar size={16} />
           </div>
           <div>
             <span className="text-3xl font-bold text-green-600 dark:text-green-500">{maturityData.find(d => d.name === 'À Boire')?.value || 0}</span>
             <span className="text-xs text-stone-500 ml-1">Prêts</span>
           </div>
        </div>

         <div 
           onClick={handleGetFact}
           className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/40 dark:to-stone-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-500/30 flex flex-col justify-between h-28 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-stone-800 transition-colors group shadow-sm"
         >
           <div className="flex justify-between items-start text-indigo-600 dark:text-indigo-300">
             <span className="text-xs uppercase font-bold tracking-wider">Le Saviez-vous?</span>
             <Lightbulb size={16} className={loadingFact ? 'animate-pulse' : ''} />
           </div>
           <div className="text-xs text-indigo-800 dark:text-indigo-200 group-hover:underline">
             Générer une anecdote sur votre cave
           </div>
        </div>
      </div>

      {/* EDUCATIONAL FACT */}
      {dailyFact && (
        <div className="bg-white dark:bg-stone-900 border-l-4 border-indigo-500 p-4 rounded-r-xl shadow-md animate-fade-in-up">
           <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
              <BookOpen size={16} />
              <span className="text-xs font-bold uppercase">Minute Pédagogique IA</span>
           </div>
           <p className="text-stone-700 dark:text-stone-300 text-sm italic leading-relaxed">
             "{dailyFact}"
           </p>
        </div>
      )}

      {/* MAIN CHARTS ROW */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Maturity Chart */}
        <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
           <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200 mb-4">Fenêtre de Maturité</h3>
           <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={maturityData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                 <XAxis type="number" hide />
                 <YAxis dataKey="name" type="category" width={80} tick={{fill: '#78716c', fontSize: 12}} />
                 <Tooltip cursor={{fill: 'transparent'}} content={<CustomTooltip />} />
                 <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {maturityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Palate Profile */}
        <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
           <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200 mb-4">Profil Gustatif de la Cave</h3>
           <div className="h-64 w-full flex items-center justify-center">
              {avgProfile ? <FlavorRadar data={avgProfile} /> : <p className="text-stone-500 text-sm">Pas assez de données</p>}
           </div>
        </div>

      </div>

      {/* INVENTORY DISTRIBUTION (Pie Chart) */}
      <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
         <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200 mb-4">Répartition du Stock</h3>
         <div className="h-64 w-full flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="w-full md:w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 grid grid-cols-2 gap-2 text-xs">
               {typeData.map((entry, i) => (
                 <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-stone-600 dark:text-stone-400">{entry.name}</span>
                    <span className="text-stone-900 dark:text-stone-200 font-bold ml-auto">{entry.value}</span>
                 </div>
               ))}
            </div>
         </div>
      </div>

    </div>
  );
};
