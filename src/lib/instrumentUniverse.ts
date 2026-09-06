// 30 real, liquid NSE large-caps across distinct sectors, plus the NIFTY 50
// index used as the relative-performance benchmark. Symbols match Yahoo
// Finance's NSE convention once ".NS" is appended by marketData.ts.

export interface SeedInstrument {
  symbol: string;
  companyName: string;
  sector: string;
}

export const INSTRUMENT_UNIVERSE: SeedInstrument[] = [
  { symbol: 'RELIANCE', companyName: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'TCS', companyName: 'Tata Consultancy Services', sector: 'IT' },
  { symbol: 'INFY', companyName: 'Infosys', sector: 'IT' },
  { symbol: 'WIPRO', companyName: 'Wipro', sector: 'IT' },
  { symbol: 'HCLTECH', companyName: 'HCL Technologies', sector: 'IT' },
  { symbol: 'TECHM', companyName: 'Tech Mahindra', sector: 'IT' },
  { symbol: 'HDFCBANK', companyName: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'ICICIBANK', companyName: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'KOTAKBANK', companyName: 'Kotak Mahindra Bank', sector: 'Banking' },
  { symbol: 'SBIN', companyName: 'State Bank of India', sector: 'Banking' },
  { symbol: 'AXISBANK', companyName: 'Axis Bank', sector: 'Banking' },
  { symbol: 'BAJFINANCE', companyName: 'Bajaj Finance', sector: 'Financial Services' },
  { symbol: 'HDFCLIFE', companyName: 'HDFC Life Insurance', sector: 'Financial Services' },
  { symbol: 'HINDUNILVR', companyName: 'Hindustan Unilever', sector: 'FMCG' },
  { symbol: 'ITC', companyName: 'ITC Limited', sector: 'FMCG' },
  { symbol: 'NESTLEIND', companyName: 'Nestle India', sector: 'FMCG' },
  { symbol: 'TMPV', companyName: 'Tata Motors Passenger Vehicles', sector: 'Auto' },
  { symbol: 'MARUTI', companyName: 'Maruti Suzuki', sector: 'Auto' },
  { symbol: 'M&M', companyName: 'Mahindra & Mahindra', sector: 'Auto' },
  { symbol: 'BAJAJ-AUTO', companyName: 'Bajaj Auto', sector: 'Auto' },
  { symbol: 'SUNPHARMA', companyName: 'Sun Pharmaceutical', sector: 'Pharma' },
  { symbol: 'DRREDDY', companyName: "Dr. Reddy's Laboratories", sector: 'Pharma' },
  { symbol: 'CIPLA', companyName: 'Cipla', sector: 'Pharma' },
  { symbol: 'LT', companyName: 'Larsen & Toubro', sector: 'Infrastructure' },
  { symbol: 'ULTRACEMCO', companyName: 'UltraTech Cement', sector: 'Cement' },
  { symbol: 'TATASTEEL', companyName: 'Tata Steel', sector: 'Metals' },
  { symbol: 'JSWSTEEL', companyName: 'JSW Steel', sector: 'Metals' },
  { symbol: 'ADANIENT', companyName: 'Adani Enterprises', sector: 'Diversified' },
  { symbol: 'ASIANPAINT', companyName: 'Asian Paints', sector: 'Consumer Goods' },
  { symbol: 'BHARTIARTL', companyName: 'Bharti Airtel', sector: 'Telecom' },
];

export const NIFTY_INDEX = { symbol: '^NSEI', companyName: 'NIFTY 50', sector: 'Index' };
