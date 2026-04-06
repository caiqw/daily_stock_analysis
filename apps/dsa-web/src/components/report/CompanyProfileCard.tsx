import type React from 'react';
import type { StockCompanyProfile } from '../../types/analysis';
import { Card } from '../common';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface CompanyProfileCardProps {
  profile?: StockCompanyProfile;
  language?: string;
  loading?: boolean;
  errorText?: string | null;
}

export const CompanyProfileCard: React.FC<CompanyProfileCardProps> = ({
  profile,
  language,
  loading = false,
  errorText,
}) => {
  const text = getReportText(normalizeReportLanguage(language));

  const details = [
    { label: text.companyName, value: profile?.companyName || profile?.stockName || '--' },
    { label: text.industry, value: profile?.industry || '--' },
    { label: text.area, value: profile?.area || '--' },
    { label: text.market, value: profile?.market || '--' },
    { label: text.listDate, value: profile?.listDate || '--' },
    { label: text.actName, value: profile?.actName || '--' },
    { label: text.actEntType, value: profile?.actEntType || '--' },
  ];

  return (
    <Card variant="bordered" padding="sm" className="home-panel-card text-left">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="label-uppercase">{text.companyProfile}</span>
      </div>
      {loading ? (
        <div className="text-sm text-secondary-text">{text.loadingCompanyInsights}</div>
      ) : errorText ? (
        <div className="text-sm text-secondary-text">{errorText}</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
            {details.map((item) => (
              <div key={item.label} className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{item.label}</div>
                <div className="mt-0.5 text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
            <div className="text-[11px] text-muted-text">{text.companyIntro}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {profile?.companyIntro || text.companyInsightsUnavailable}
            </div>
          </div>
          <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
            <div className="text-[11px] text-muted-text">{text.mainBusiness}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {profile?.mainBusiness || text.companyInsightsUnavailable}
            </div>
          </div>
          <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
            <div className="text-[11px] text-muted-text">{text.businessScope}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {profile?.businessScope || text.companyInsightsUnavailable}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
