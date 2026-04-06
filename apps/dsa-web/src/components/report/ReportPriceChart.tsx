import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Brush, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { stocksApi } from '../../api/stocks';
import { Card } from '../common';
import type { KLineData } from '../../types/analysis';

interface ReportPriceChartProps {
  stockCode: string;
}

type Period = 'daily' | 'monthly';
type ChartMode = 'line' | 'k';

const formatDateLabel = (value: string) => {
  const text = (value || '').trim();
  if (text.length >= 10) return text.slice(0, 10);
  return text;
};

const dateKey = (value?: string) => (value || '').trim().slice(0, 10);

type ChartPoint = KLineData & {
  dateLabel: string;
  dateKey: string;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  bodyBase: number;
  bodySize: number;
  up: boolean;
};

const calcMovingAverage = (rows: KLineData[], index: number, windowSize: number): number | null => {
  if (index + 1 < windowSize) {
    return null;
  }
  let total = 0;
  for (let i = index - windowSize + 1; i <= index; i += 1) {
    total += Number(rows[i].close);
  }
  return total / windowSize;
};

const formatNumber = (value?: number | null, digits = 2) => {
  if (value == null || Number.isNaN(value)) return '--';
  return Number(value).toFixed(digits);
};

const formatVolume = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) return '--';
  return Number(value).toLocaleString('zh-CN');
};

const toValidNumber = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

export const ReportPriceChart: React.FC<ReportPriceChartProps> = ({ stockCode }) => {
  const [period, setPeriod] = useState<Period>('daily');
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [days, setDays] = useState(120);
  const [inputDays, setInputDays] = useState('120');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<KLineData[]>([]);

  const loadData = useCallback(async () => {
    if (!stockCode) {
      setSeries([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await stocksApi.getHistory(stockCode, period, days);
      setSeries(response.data || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : '加载股价失败';
      setError(message || '加载股价失败');
      setSeries([]);
    } finally {
      setIsLoading(false);
    }
  }, [days, period, stockCode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (series.length === 0) {
      return [];
    }

    // 过滤异常行情点（例如 low=0 / high<low），避免把坐标轴拉爆导致曲线被压扁
    const sanitized = series.filter((item) => {
      const open = toValidNumber(item.open);
      const high = toValidNumber(item.high);
      const low = toValidNumber(item.low);
      const close = toValidNumber(item.close);
      if (open == null || high == null || low == null || close == null) return false;
      if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return false;
      if (high < low) return false;
      return true;
    });

    if (sanitized.length === 0) {
      return [];
    }

    const lows = sanitized.map((item) => Number(item.low));
    const highs = sanitized.map((item) => Number(item.high));
    const minLow = Math.min(...lows);
    const maxHigh = Math.max(...highs);
    const epsilon = Math.max(0.001, (maxHigh - minLow) * 0.001);

    return sanitized.map((item, index) => {
      const open = Number(item.open);
      const close = Number(item.close);
      const bodyBase = Math.min(open, close);
      const bodySizeRaw = Math.abs(close - open);
      return {
        ...item,
        dateLabel: formatDateLabel(item.date),
        dateKey: dateKey(item.date),
        ma5: calcMovingAverage(sanitized, index, 5),
        ma10: calcMovingAverage(sanitized, index, 10),
        ma20: calcMovingAverage(sanitized, index, 20),
        bodyBase,
        bodySize: bodySizeRaw === 0 ? epsilon : bodySizeRaw,
        up: close >= open,
      };
    });
  }, [series]);

  const filteredData = useMemo(() => {
    const from = dateKey(startDate);
    const to = dateKey(endDate);
    if (!from && !to) {
      return chartData;
    }
    return chartData.filter((item) => {
      if (from && item.dateKey < from) return false;
      if (to && item.dateKey > to) return false;
      return true;
    });
  }, [chartData, startDate, endDate]);

  const yDomain = useMemo(() => {
    if (filteredData.length === 0) {
      return ['dataMin', 'dataMax'] as const;
    }
    const lows = filteredData
      .map((item) => Number(item.low))
      .filter((v) => Number.isFinite(v) && v > 0);
    const highs = filteredData
      .map((item) => Number(item.high))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (lows.length === 0 || highs.length === 0) {
      return ['dataMin', 'dataMax'] as const;
    }
    const minLow = Math.min(...lows);
    const maxHigh = Math.max(...highs);
    const pad = Math.max(0.01, (maxHigh - minLow) * 0.03);
    return [minLow - pad, maxHigh + pad] as const;
  }, [filteredData]);

  const volumeMax = useMemo(() => {
    if (filteredData.length === 0) return 0;
    return Math.max(...filteredData.map((item) => Number(item.volume || 0)));
  }, [filteredData]);

  const handleSearch = useCallback(() => {
    const parsed = Number(inputDays);
    const normalized = Number.isFinite(parsed) ? Math.min(3650, Math.max(30, Math.round(parsed))) : 120;
    setDays(normalized);
    setInputDays(String(normalized));
  }, [inputDays]);

  const applyQuickRange = useCallback((months: number) => {
    const normalized = Math.max(30, Math.min(3650, months * 30));
    setDays(normalized);
    setInputDays(String(normalized));
  }, []);

  const resetDateFilter = useCallback(() => {
    setStartDate('');
    setEndDate('');
  }, []);

  return (
    <Card variant="bordered" padding="sm" className="home-panel-card text-left">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label-uppercase">PRICE CHART</p>
          <h3 className="mt-0.5 text-base font-semibold text-foreground">股价走势</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${period === 'daily' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
            onClick={() => setPeriod('daily')}
          >
            日线
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${period === 'monthly' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
            onClick={() => setPeriod('monthly')}
          >
            月线
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${chartMode === 'line' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
            onClick={() => setChartMode('line')}
          >
            收盘线
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${chartMode === 'k' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
            onClick={() => setChartMode('k')}
          >
            K线(简化)
          </button>
          {[1, 3, 6, 12].map((m) => (
            <button
              key={m}
              type="button"
              className="rounded-md px-2 py-1 text-xs hover:bg-hover"
              onClick={() => applyQuickRange(m)}
            >
              近{m}月
            </button>
          ))}
          <input
            type="number"
            min={30}
            max={3650}
            value={inputDays}
            onChange={(e) => setInputDays(e.target.value)}
            className="input-surface h-8 w-20 rounded-md border bg-transparent px-2 text-xs"
          />
          <button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={handleSearch}>
            搜索
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input-surface h-8 rounded-md border bg-transparent px-2 text-xs"
        />
        <span className="text-xs text-secondary-text">至</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="input-surface h-8 rounded-md border bg-transparent px-2 text-xs"
        />
        <button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={resetDateFilter}>
          重置日期
        </button>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-sm text-secondary-text">加载股价中...</div>
      ) : error ? (
        <div className="h-64 flex items-center justify-center text-sm text-danger">{error}</div>
      ) : filteredData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-secondary-text">暂无股价数据</div>
      ) : (
        <div className="h-64">
          {chartMode === 'line' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateKey" minTickGap={24} tickFormatter={formatDateLabel} />
                <YAxis yAxisId="price" domain={yDomain} />
                <YAxis yAxisId="volume" orientation="right" hide domain={[0, Math.max(1, volumeMax * 4)]} />
                <Tooltip
                  cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const point = payload[0].payload as ChartPoint;
                    return (
                      <div className="rounded-md border border-subtle bg-surface px-3 py-2 text-xs shadow-lg">
                        <div className="mb-1 font-medium text-foreground">日期: {formatDateLabel(String(label))}</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-secondary-text">
                          <span>开: {formatNumber(point.open)}</span>
                          <span>高: {formatNumber(point.high)}</span>
                          <span>低: {formatNumber(point.low)}</span>
                          <span>收: {formatNumber(point.close)}</span>
                          <span>MA5: {formatNumber(point.ma5)}</span>
                          <span>MA10: {formatNumber(point.ma10)}</span>
                          <span>MA20: {formatNumber(point.ma20)}</span>
                          <span>量: {formatVolume(point.volume)}</span>
                        </div>
                      </div>
                    );
                  }}
                  labelFormatter={(value) => `日期: ${formatDateLabel(String(value))}`}
                />
                <Bar yAxisId="volume" dataKey="volume" fill="#64748b55" barSize={3} />
                <Line yAxisId="price" type="monotone" dataKey="close" stroke="#00d4ff" strokeWidth={2} dot={false} name="收盘" />
                <Line yAxisId="price" type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1.2} dot={false} name="MA5" />
                <Line yAxisId="price" type="monotone" dataKey="ma10" stroke="#a78bfa" strokeWidth={1.2} dot={false} name="MA10" />
                <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#22c55e" strokeWidth={1.2} dot={false} name="MA20" />
                <Brush dataKey="dateKey" height={24} stroke="#64748b" travellerWidth={10} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateKey" minTickGap={24} tickFormatter={formatDateLabel} />
                <YAxis yAxisId="price" domain={yDomain} />
                <YAxis yAxisId="volume" orientation="right" hide domain={[0, Math.max(1, volumeMax * 4)]} />
                <Tooltip
                  cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const point = payload[0].payload as ChartPoint;
                    return (
                      <div className="rounded-md border border-subtle bg-surface px-3 py-2 text-xs shadow-lg">
                        <div className="mb-1 font-medium text-foreground">日期: {formatDateLabel(String(label))}</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-secondary-text">
                          <span>开: {formatNumber(point.open)}</span>
                          <span>高: {formatNumber(point.high)}</span>
                          <span>低: {formatNumber(point.low)}</span>
                          <span>收: {formatNumber(point.close)}</span>
                          <span>MA5: {formatNumber(point.ma5)}</span>
                          <span>MA10: {formatNumber(point.ma10)}</span>
                          <span>MA20: {formatNumber(point.ma20)}</span>
                          <span>量: {formatVolume(point.volume)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                {filteredData.map((item) => (
                  <ReferenceLine
                    key={`wick-${item.dateKey}`}
                    segment={[
                      { x: item.dateKey, y: item.low },
                      { x: item.dateKey, y: item.high },
                    ]}
                    stroke={item.up ? '#22c55e' : '#ef4444'}
                    strokeWidth={1}
                    yAxisId="price"
                  />
                ))}
                <Bar yAxisId="volume" dataKey="volume" fill="#64748b55" barSize={3} />
                <Bar yAxisId="price" dataKey="bodyBase" stackId="body" fill="transparent" isAnimationActive={false} />
                <Bar
                  yAxisId="price"
                  dataKey="bodySize"
                  stackId="body"
                  name="close"
                  barSize={6}
                  isAnimationActive={false}
                >
                  {filteredData.map((item) => (
                    <Cell key={`body-${item.dateKey}`} fill={item.up ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
                <Line yAxisId="price" type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1.1} dot={false} name="MA5" />
                <Line yAxisId="price" type="monotone" dataKey="ma10" stroke="#a78bfa" strokeWidth={1.1} dot={false} name="MA10" />
                <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#22c55e" strokeWidth={1.1} dot={false} name="MA20" />
                <Line yAxisId="price" type="monotone" dataKey="open" stroke="transparent" dot={false} name="open" />
                <Line yAxisId="price" type="monotone" dataKey="high" stroke="transparent" dot={false} name="high" />
                <Line yAxisId="price" type="monotone" dataKey="low" stroke="transparent" dot={false} name="low" />
                <Line yAxisId="price" type="monotone" dataKey="close" stroke="transparent" dot={false} name="close" />
                <Brush dataKey="dateKey" height={24} stroke="#64748b" travellerWidth={10} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </Card>
  );
};

export default ReportPriceChart;
