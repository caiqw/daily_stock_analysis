import type React from 'react';
import type {
  ReportDetails as ReportDetailsType,
  ReportMeta,
  ReportSummary as ReportSummaryType,
} from '../../types/analysis';
import { Badge, Card, ScoreGauge } from '../common';
import { formatDateTime } from '../../utils/format';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface ReportOverviewProps {
  meta: ReportMeta;
  summary: ReportSummaryType;
  details?: ReportDetailsType;
  isHistory?: boolean;
}

type BoardStatus = 'leading' | 'lagging';

type BoardSignal = {
  status: BoardStatus;
  changePct?: number;
};

const normalizeBoardName = (value?: string): string =>
  (value || '').trim().replace(/\s+/g, ' ');

const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/%$/, '');
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const buildBoardSignalMap = (details?: ReportDetailsType): Map<string, BoardSignal> => {
  const signalMap = new Map<string, BoardSignal>();
  const topBoards = Array.isArray(details?.sectorRankings?.top) ? details.sectorRankings.top : [];
  const bottomBoards = Array.isArray(details?.sectorRankings?.bottom) ? details.sectorRankings.bottom : [];

  topBoards.forEach((item) => {
    const normalizedName = normalizeBoardName(item?.name);
    if (!normalizedName) {
      return;
    }
    signalMap.set(normalizedName, {
      status: 'leading',
      changePct: coerceFiniteNumber(item.changePct),
    });
  });

  bottomBoards.forEach((item) => {
    const normalizedName = normalizeBoardName(item?.name);
    if (!normalizedName) {
      return;
    }
    signalMap.set(normalizedName, {
      status: 'lagging',
      changePct: coerceFiniteNumber(item.changePct),
    });
  });

  return signalMap;
};

/**
 * 报告概览区组件 - 终端风格
 */
export const ReportOverview: React.FC<ReportOverviewProps> = ({
  meta,
  summary,
  details,
}) => {
  const reportLanguage = normalizeReportLanguage(meta.reportLanguage);
  const text = getReportText(reportLanguage);
  const relatedBoards = (Array.isArray(details?.belongBoards) ? details.belongBoards : [])
    .filter((board) => normalizeBoardName(board?.name).length > 0)
    .slice(0, 3);
  const boardSignals = buildBoardSignalMap(details);

  const getPriceChangeStyle = (changePct: number | undefined): React.CSSProperties | undefined => {
    if (changePct === undefined || changePct === null) {
      return undefined;
    }

    if (changePct > 0) {
      return { color: 'var(--home-price-up)' };
    }

    if (changePct < 0) {
      return { color: 'var(--home-price-down)' };
    }

    return undefined;
  };

  const formatChangePct = (changePct: number | undefined): string => {
    if (changePct === undefined || changePct === null) return '--';
    const sign = changePct > 0 ? '+' : '';
    return `${sign}${changePct.toFixed(2)}%`;
  };

  const getBoardStatusLabel = (status: BoardStatus): string => {
    if (status === 'leading') {
      return text.leadingBoard;
    }
    return text.laggingBoard;
  };

  const getBoardStatusVariant = (status: BoardStatus): 'success' | 'danger' => {
    if (status === 'leading') {
      return 'success';
    }
    return 'danger';
  };

  const formatListDate = (value?: string) => {
    const textValue = (value || '').trim();
    if (!textValue) {
      return '--';
    }
    if (/^\d{8}$/.test(textValue)) {
      return `${textValue.slice(0, 4)}-${textValue.slice(4, 6)}-${textValue.slice(6, 8)}`;
    }
    return textValue;
  };

  return (
    <div className="space-y-5">
      <div className="space-y-5">
          {/* 股票头部 */}
          <Card variant="gradient" padding="md" className="home-report-hero">
            <div className="flex items-start justify-between mb-5">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-[28px] font-bold leading-tight text-foreground">
                    {meta.stockName || meta.stockCode}
                  </h2>
                  {/* 价格和涨跌幅 */}
                  {meta.currentPrice != null && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold font-mono" style={getPriceChangeStyle(meta.changePct)}>
                        {meta.currentPrice.toFixed(2)}
                      </span>
                      <span className="text-sm font-semibold font-mono" style={getPriceChangeStyle(meta.changePct)}>
                        {formatChangePct(meta.changePct)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="home-accent-chip px-2 py-0.5 font-mono text-xs">
                    {meta.stockCode}
                  </span>
                  <span className="text-xs text-muted-text flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDateTime(meta.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* 关键结论 */}
            <div className="home-divider border-t pt-5">
              <span className="label-uppercase">{text.keyInsights}</span>
              <div className="mt-2 grid gap-4 lg:grid-cols-3">
                <p className="whitespace-pre-wrap text-left text-[15px] leading-7 text-foreground lg:col-span-2">
                  {summary.analysisSummary || text.noAnalysisSummary}
                </p>
                <div className="space-y-2">
                  <Card
                    variant="bordered"
                    padding="sm"
                    className="home-panel-card home-insight-card"
                    style={{ ['--home-insight-tone' as string]: 'var(--home-strategy-buy)' }}
                  >
                    <div className="space-y-1">
                      <h4 className="home-insight-title text-[11px] font-medium uppercase tracking-[0.16em]">{text.actionAdvice}</h4>
                      <p className="home-insight-body text-sm leading-6">
                        {summary.operationAdvice || text.noAdvice}
                      </p>
                    </div>
                  </Card>
                  <Card
                    variant="bordered"
                    padding="sm"
                    className="home-panel-card home-insight-card"
                    style={{ ['--home-insight-tone' as string]: 'var(--home-strategy-take)' }}
                  >
                    <div className="space-y-1">
                      <h4 className="home-insight-title text-[11px] font-medium uppercase tracking-[0.16em]">{text.trendPrediction}</h4>
                      <p className="home-insight-body text-sm leading-6">
                        {summary.trendPrediction || text.noPrediction}
                      </p>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </Card>

          <Card variant="bordered" padding="sm" className="home-panel-card text-left">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="label-uppercase">{text.basicInfo}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.stockName}</div>
                <div className="mt-0.5 font-medium text-foreground">{meta.stockName || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.stockCode}</div>
                <div className="mt-0.5 font-mono text-foreground">{meta.stockCode || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.industry}</div>
                <div className="mt-0.5 text-foreground">{meta.industry || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.area}</div>
                <div className="mt-0.5 text-foreground">{meta.area || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.market}</div>
                <div className="mt-0.5 text-foreground">{meta.market || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.listDate}</div>
                <div className="mt-0.5 text-foreground">{formatListDate(meta.listDate)}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.symbol}</div>
                <div className="mt-0.5 font-mono text-foreground">{meta.symbol || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.cnspell}</div>
                <div className="mt-0.5 text-foreground">{meta.cnspell || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2">
                <div className="text-[11px] text-muted-text">{text.actName}</div>
                <div className="mt-0.5 text-foreground">{meta.actName || '--'}</div>
              </div>
              <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2 md:col-span-2 xl:col-span-2 2xl:col-span-1">
                <div className="text-[11px] text-muted-text">{text.actEntType}</div>
                <div className="mt-0.5 text-foreground">{meta.actEntType || '--'}</div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
            {relatedBoards.length > 0 ? (
              <Card variant="bordered" padding="sm" className="home-panel-card text-left xl:col-span-2">
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="label-uppercase">{text.boardLinkage}</span>
                  <h3 className="mt-0.5 text-base font-semibold text-foreground">{text.relatedBoards}</h3>
                </div>

                <div className="space-y-2.5">
                  {relatedBoards.map((board, index) => {
                    const boardName = normalizeBoardName(board.name);
                    const signal = boardSignals.get(boardName);
                    return (
                      <div
                        key={`${boardName}-${board.code || index}`}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span className="home-accent-chip px-2 py-0.5 text-xs font-medium">
                          {boardName}
                        </span>
                        {board.type && (
                          <span className="home-board-pill rounded-full px-2 py-0.5 text-xs">
                            {board.type}
                          </span>
                        )}
                        {signal && (
                          <Badge
                            variant={getBoardStatusVariant(signal.status)}
                            className="home-board-status-badge shadow-none"
                          >
                            {getBoardStatusLabel(signal.status)}
                          </Badge>
                        )}
                        {signal && signal.changePct !== undefined && signal.changePct !== null && (
                          <span
                            className="text-xs font-mono"
                            style={getPriceChangeStyle(signal.changePct)}
                          >
                            {formatChangePct(signal.changePct)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : (
              <Card variant="bordered" padding="sm" className="home-panel-card text-left xl:col-span-2">
                <div className="text-sm text-secondary-text">暂无关联板块数据</div>
              </Card>
            )}

            <Card variant="bordered" padding="sm" className="home-panel-card home-rail-card !overflow-visible self-start">
              <div className="text-center py-2">
                <h3 className="mb-3 text-sm font-medium tracking-wide text-foreground">{text.marketSentiment}</h3>
                <ScoreGauge score={summary.sentimentScore} size="md" language={reportLanguage} />
              </div>
            </Card>
          </div>
      </div>
    </div>
  );
};
