import type React from 'react';
import type { StockFinancialMetrics } from '../../types/analysis';
import { Card } from '../common';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface FinancialMetricsCardProps {
  metrics?: StockFinancialMetrics;
  language?: string;
  loading?: boolean;
  errorText?: string | null;
}

const formatNumber = (value?: number): string => {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
};

const formatPercent = (value?: number): string => {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(2)}%`;
};

export const FinancialMetricsCard: React.FC<FinancialMetricsCardProps> = ({
  metrics,
  language,
  loading = false,
  errorText,
}) => {
  const text = getReportText(normalizeReportLanguage(language));

  const rows = [
    { label: text.peRatio, value: formatNumber(metrics?.peRatio) },
    { label: text.pbRatio, value: formatNumber(metrics?.pbRatio) },
    { label: text.psRatio, value: formatNumber(metrics?.psRatio) },
    { label: text.pegRatio, value: formatNumber(metrics?.pegRatio) },
    { label: text.dividendYield, value: formatPercent(metrics?.dividendYield) },
    { label: text.totalMarketValue, value: formatNumber(metrics?.totalMv) },
    { label: text.floatMarketValue, value: formatNumber(metrics?.circMv) },
    { label: text.revenue, value: formatNumber(metrics?.revenue) },
    { label: text.netProfitParent, value: formatNumber(metrics?.netProfitParent) },
    { label: text.operatingCashFlow, value: formatNumber(metrics?.operatingCashFlow) },
    { label: text.roe, value: formatPercent(metrics?.roe) },
    { label: text.roa, value: formatPercent(metrics?.roa) },
    { label: text.grossMargin, value: formatPercent(metrics?.grossMargin) },
    { label: text.netMargin, value: formatPercent(metrics?.netMargin) },
    { label: text.debtRatio, value: formatPercent(metrics?.debtRatio) },
    { label: text.revenueYoy, value: formatPercent(metrics?.revenueYoy) },
    { label: text.netProfitYoy, value: formatPercent(metrics?.netProfitYoy) },
  ];

  return (
    <Card variant="bordered" padding="sm" className="home-panel-card text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="label-uppercase">{text.financialMetrics}</span>
        <span className="text-[11px] text-muted-text">
          {text.asOf}: {metrics?.asOf || '--'}
        </span>
      </div>
      {loading ? (
        <div className="text-sm text-secondary-text">{text.loadingCompanyInsights}</div>
      ) : errorText ? (
        <div className="text-sm text-secondary-text">{errorText}</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <div key={item.label} className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
              <div className="text-[11px] text-muted-text">{item.label}</div>
              <div className="mt-0.5 font-mono text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
