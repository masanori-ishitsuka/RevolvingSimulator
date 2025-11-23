export interface SimulationParams {
  initialBalance: number;
  monthlyNewCharge: number;
  monthlyRepayment: number;
  annualInterestRate: number;
}

export interface MonthData {
  month: number;
  balance: number;
  principalPaid: number;
  interestPaid: number;
  totalPaid: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
  remainingInterest: number;
}

export interface SimulationResult {
  data: MonthData[];
  totalInterest: number;
  totalPaid: number;
  months: number;
  isInfinite: boolean;
}