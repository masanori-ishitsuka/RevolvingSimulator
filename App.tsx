import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import { 
  Calculator, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  DollarSign, 
  Info,
  RefreshCcw
} from 'lucide-react';
import { SimulationParams, SimulationResult, MonthData } from './types';

// --- Utility Functions ---

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
};

// Calculate the total interest required to clear a specific balance
// assuming NO further new charges and a fixed repayment amount.
const calculateProjectedInterest = (
  balance: number, 
  monthlyRepayment: number, 
  annualInterestRate: number
): number => {
  if (balance <= 0) return 0;
  
  let currentBal = balance;
  let totalInt = 0;
  const monthlyRate = annualInterestRate / 100 / 12;
  const MAX_PROJ_MONTHS = 600; // Cap projection at 50 years to avoid performance issues
  
  for (let i = 0; i < MAX_PROJ_MONTHS; i++) {
    const interest = Math.floor(currentBal * monthlyRate);
    
    // Logic: Standard repayment priority (interest first)
    let payment = monthlyRepayment;
    
    // Payoff check
    if (currentBal + interest <= payment) {
      payment = currentBal + interest;
    }
    
    const principal = payment - interest;
    
    currentBal -= principal;
    totalInt += interest;
    
    if (currentBal <= 0) break;
  }
  
  return totalInt;
};

const calculateSimulation = (params: SimulationParams): SimulationResult => {
  const { initialBalance, monthlyNewCharge, monthlyRepayment, annualInterestRate } = params;
  
  let balance = initialBalance;
  let totalInterest = 0;
  let totalPaid = 0;
  let cumulativePrincipal = 0;
  const data: MonthData[] = [];
  
  // Safety break to prevent infinite loops and browser crashes
  const MAX_MONTHS = 600; // 50 years cap
  let month = 0;
  const monthlyRate = annualInterestRate / 100 / 12;

  // Initial state (Month 0)
  data.push({
    month: 0,
    balance: balance,
    principalPaid: 0,
    interestPaid: 0,
    totalPaid: 0,
    cumulativeInterest: 0,
    cumulativePrincipal: 0,
    remainingInterest: calculateProjectedInterest(balance, monthlyRepayment, annualInterestRate),
  });

  let isInfinite = false;

  while (balance > 0 && month < MAX_MONTHS) {
    month++;
    
    // Calculate Interest for the current balance
    const interest = Math.floor(balance * monthlyRate);

    // Determine payment amount (cannot exceed balance + interest)
    let payment = monthlyRepayment;
    
    // Handle payoff phase logic inside calculation
    if (balance + interest <= payment) {
      payment = balance + interest;
    }

    const principal = payment - interest;
    
    // Check for runaway balance before update (prevent overflow)
    if (balance > initialBalance * 5 && balance > 1000000) {
        isInfinite = true;
        break;
    }

    const prevBalance = balance;
    
    // Apply changes
    // Balance reduces by principal paid, increases by new charges
    balance = balance - principal + monthlyNewCharge;
    
    // Safety floor
    if (balance < 0) balance = 0;

    totalInterest += interest;
    totalPaid += payment;
    cumulativePrincipal += principal;

    // Calculate projected interest for the NEW balance
    // This answers: "If I stop charging now, how much interest is left?"
    const projectedInterest = calculateProjectedInterest(balance, monthlyRepayment, annualInterestRate);

    data.push({
      month,
      balance,
      principalPaid: principal,
      interestPaid: interest,
      totalPaid: payment,
      cumulativeInterest: totalInterest,
      cumulativePrincipal: cumulativePrincipal,
      remainingInterest: projectedInterest
    });

    // --- TERMINATION CONDITIONS ---

    // 1. Balance reaches zero
    if (balance <= 0) break;

    // 2. User Requirement: Balance drops below Monthly Repayment
    // This signifies the debt is effectively cleared or manageable within one cycle.
    // If the remaining balance is less than what we pay monthly, we consider the simulation "done"
    // to prevent the graph from trailing on with tiny balances or stabilized new charges.
    if (balance < monthlyRepayment) {
        break;
    }

    // 3. Stable State Check
    // If balance stabilizes (e.g. paying off exactly the new charge amount), we should check if it's a "paid off" state or "stuck" state.
    if (monthlyNewCharge > 0 && Math.abs(balance - prevBalance) <= 10) {
        // If the balance is relatively low (close to the new charge amount), it means we are just cycling new charges.
        // We consider this a success state (not infinite debt).
        if (balance <= monthlyNewCharge * 1.5) {
            break; 
        }
        
        // If balance is stabilized at a high amount (where Interest + NewCharge ~= Repayment),
        // it is effectively an infinite debt trap.
        if (balance > monthlyRepayment) {
             isInfinite = true;
             break;
        }
    }
  }

  // If we hit MAX_MONTHS and didn't break early, it's infinite.
  if (month >= MAX_MONTHS) {
    isInfinite = true;
  }

  return {
    data: data,
    totalInterest,
    totalPaid,
    months: month,
    isInfinite
  };
};

// --- Components ---

const InputField = ({ 
  label, 
  value, 
  onChange, 
  unit, 
  step = 1000, 
  min = 0,
  max
}: { 
  label: string; 
  value: number; 
  onChange: (val: number) => void; 
  unit: string;
  step?: number;
  min?: number;
  max?: number;
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-sm font-medium text-slate-600">{label}</label>
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-800 font-medium"
        step={step}
        min={min}
        max={max}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">
        {unit}
      </span>
    </div>
    <input 
        type="range" 
        min={min} 
        max={max || value * 2} 
        step={step}
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
    />
  </div>
);

const SummaryCard = ({ title, value, subtext, icon: Icon, colorClass }: { title: string, value: string, subtext?: string, icon: any, colorClass: string }) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
    <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10 shrink-0`}>
      <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [params, setParams] = useState<SimulationParams>({
    initialBalance: 300000,
    monthlyNewCharge: 0,
    monthlyRepayment: 5000,
    annualInterestRate: 18.0,
  });

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isEmbed, setIsEmbed] = useState(false);

  useEffect(() => {
    setResult(calculateSimulation(params));
  }, [params]);

  useEffect(() => {
    // Check for 'mode=embed' in URL parameters
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('mode') === 'embed') {
      setIsEmbed(true);
    }
  }, []);

  // Derived check for "Danger Zone"
  const monthlyInterest = Math.floor(params.initialBalance * (params.annualInterestRate / 100 / 12));
  const isDanger = params.monthlyRepayment <= monthlyInterest && params.initialBalance > 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header - Hidden in embed mode */}
      {!isEmbed && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              リボ払いシミュレーター
            </h1>
          </div>
        </header>
      )}

      {/* Main Content - Reduced padding in embed mode */}
      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${isEmbed ? 'py-4' : 'py-8'}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Input Section */}
          <div className="lg:col-span-1 space-y-6">
            <div className={`bg-white rounded-2xl p-6 shadow-sm border border-slate-200 ${isEmbed ? '' : 'sticky top-24'}`}>
              <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
                <RefreshCcw className="w-5 h-5 text-indigo-500" />
                設定条件
              </h2>
              
              <div className="space-y-6">
                <InputField 
                  label="利用残高 (開始時)" 
                  value={params.initialBalance} 
                  onChange={(v) => setParams(p => ({ ...p, initialBalance: v }))} 
                  unit="円"
                  max={2000000}
                />
                
                <InputField 
                  label="毎月の追加利用額" 
                  value={params.monthlyNewCharge} 
                  onChange={(v) => setParams(p => ({ ...p, monthlyNewCharge: v }))} 
                  unit="円"
                  max={100000}
                />

                <div className="pt-2 border-t border-slate-100"></div>

                <InputField 
                  label="毎月の返済額 (元金+利息)" 
                  value={params.monthlyRepayment} 
                  onChange={(v) => setParams(p => ({ ...p, monthlyRepayment: v }))} 
                  unit="円"
                  max={100000}
                />

                {isDanger && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-red-700">
                      <p className="font-bold">警告: 返済額が少なすぎます</p>
                      <p>初月の利息({formatCurrency(monthlyInterest)})を下回っています。このままでは残高が減りません。</p>
                    </div>
                  </div>
                )}

                <InputField 
                  label="実質年率" 
                  value={params.annualInterestRate} 
                  onChange={(v) => setParams(p => ({ ...p, annualInterestRate: v }))} 
                  unit="%" 
                  step={0.1}
                  max={20.0}
                />
              </div>

              <div className="mt-6 p-4 bg-indigo-50 rounded-lg text-xs text-indigo-700 leading-relaxed">
                <p className="flex items-center gap-1 font-semibold mb-1">
                  <Info className="w-3 h-3" />
                  シミュレーションの前提
                </p>
                「元利定額方式」を想定しています。毎月の支払額（元金＋利息）が一定になるように計算されます。
                ※実際の日割り計算とは異なる概算です。
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Analysis Box */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                シミュレーション分析
              </h3>
              <div className="space-y-4 text-sm leading-relaxed text-slate-300">
                <p>
                  この設定では、毎月 <strong className="text-white text-base">{formatCurrency(params.monthlyRepayment)}</strong> 返済していますが、
                  そのうち初月は約 <strong className="text-yellow-400 text-base">{formatCurrency(Math.floor(params.initialBalance * params.annualInterestRate / 100 / 12))}</strong> が利息に消えています。
                </p>
                {result && !result.isInfinite && (
                  <p>
                    最終的に借りた金額 <strong className="text-white">{formatCurrency(params.initialBalance + (params.monthlyNewCharge * result.months))}</strong> に対して、
                    返済総額は <strong className="text-white">{formatCurrency(result.totalPaid)}</strong> になります。
                    差額の <strong className="text-red-400 text-lg border-b border-red-400">{formatCurrency(result.totalInterest)}</strong> を手数料として支払う計算です。
                  </p>
                )}
                {result?.isInfinite && (
                  <p className="text-red-300 font-bold bg-red-900/30 p-3 rounded-lg border border-red-800">
                    現在の返済額では利息と追加利用分を賄いきれておらず、借金が雪だるま式に増え続ける（または終わらない）可能性があります。返済額を増額することを強くお勧めします。
                  </p>
                )}
              </div>
            </div>

            {/* Summary Cards */}
            {result && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <SummaryCard 
                  title="返済総額" 
                  value={result.isInfinite ? "計測不能" : formatCurrency(result.totalPaid)} 
                  subtext={result.isInfinite ? "50年以上かかります" : `元金 ${formatCurrency(params.initialBalance)} + 利息など`}
                  icon={DollarSign}
                  colorClass="bg-slate-800 text-slate-800"
                />
                <SummaryCard 
                  title="利息総額" 
                  value={result.isInfinite ? "∞" : formatCurrency(result.totalInterest)} 
                  subtext={`元金の ${Math.round((result.totalInterest / params.initialBalance) * 100)}% に相当`}
                  icon={TrendingUp}
                  colorClass="bg-red-500 text-red-500"
                />
                <SummaryCard 
                  title="完済までの期間" 
                  value={result.isInfinite ? "50年以上" : `${Math.floor(result.months / 12)}年 ${result.months % 12}ヶ月`} 
                  subtext={`${result.months} 回払い`}
                  icon={TrendingDown}
                  colorClass="bg-emerald-500 text-emerald-500"
                />
              </div>
            )}

            {/* Chart 1: Remaining Balance & Future Interest */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-indigo-600" />
                  総支払残額の推移 (元金 + 予定利息)
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  利息を含めた返済予定の総残額の推移です。
                  {result?.isInfinite ? 
                    <span className="text-red-500 font-bold ml-1">残高が減らない、または増加しています！</span> : 
                    " 赤い部分は「将来支払うことになる利息」です。"
                  }
                </p>
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Changed bottom margin to 30 to show XAxis label */}
                  <AreaChart data={result?.data} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.2}/>
                      </linearGradient>
                      <linearGradient id="colorRemainingInterest" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="month" 
                      label={{ value: '経過月数', position: 'insideBottomRight', offset: -5 }} 
                      tick={{fontSize: 12}}
                      stroke="#94a3b8"
                    />
                    <YAxis 
                      tickFormatter={(value) => `${value / 10000}万`} 
                      tick={{fontSize: 12}}
                      stroke="#94a3b8"
                    />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `${label}ヶ月目`}
                      contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    {/* Render Balance first (bottom) then Interest (top) */}
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      stackId="1" 
                      name="元金残高" 
                      stroke="#6366f1" 
                      fill="url(#colorBalance)" 
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="remainingInterest" 
                      stackId="1" 
                      name="返済予定の利息 (将来の負担)" 
                      stroke="#f43f5e" 
                      fill="url(#colorRemainingInterest)" 
                      strokeWidth={2}
                    />
                    <ReferenceLine y={params.initialBalance} stroke="#cbd5e1" strokeDasharray="3 3" label={{ position: 'top',  value: '開始時元金', fill: '#94a3b8', fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Cumulative Repayment (Stacked) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
               <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  返済済額の積み上げ（元金 vs 利息）
                </h3>
                <p className="text-sm text-slate-500">
                  毎月支払っているお金の内訳です。<span className="text-red-500 font-bold">赤色（利息）</span>の部分が大きいほど、無駄な支払いを続けていることになります。
                </p>
              </div>

              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result?.data} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
                     <defs>
                      <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4}/>
                      </linearGradient>
                      <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.4}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="month" 
                      tick={{fontSize: 12}}
                      stroke="#94a3b8"
                      label={{ value: '経過月数', position: 'insideBottomRight', offset: -5 }} 
                    />
                    <YAxis 
                      tickFormatter={(value) => `${value / 10000}万`} 
                      tick={{fontSize: 12}}
                      stroke="#94a3b8"
                    />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `${label}ヶ月目`}
                      contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    {/* Swapped order: Principal first (bottom), then Interest (top) */}
                    <Area 
                      type="monotone" 
                      dataKey="cumulativePrincipal" 
                      stackId="1" 
                      name="支払い済みの元金" 
                      stroke="#10b981" 
                      fill="url(#colorPrincipal)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cumulativeInterest" 
                      stackId="1" 
                      name="支払い済みの利息" 
                      stroke="#ef4444" 
                      fill="url(#colorInterest)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}