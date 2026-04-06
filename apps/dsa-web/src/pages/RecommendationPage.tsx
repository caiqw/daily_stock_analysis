import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ApiErrorAlert, Button, Drawer, InlineAlert } from '../components/common';
import { DashboardStateBlock } from '../components/dashboard';
import { ReportMarkdown, ReportSummary } from '../components/report';
import { TaskPanel } from '../components/tasks';
import { useDashboardLifecycle } from '../hooks';
import { useAuth } from '../contexts/AuthContext';
import { useStockPoolStore } from '../stores';
import type { HistoryItem } from '../types/analysis';
import { getSentimentColor } from '../types/analysis';
import { normalizeReportLanguage } from '../utils/reportLanguage';

const UNIVERSE_PAGE_SIZE = 100;

type ResultFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';
type ResultScopeFilter = 'all' | 'submitted';
type ViewMode = 'list' | 'industry';
type SectionMode = 'pool' | 'results';
type TaskInfoStatus = 'pending' | 'processing' | 'completed' | 'failed';
type PoolQuickFilter = 'all' | 'analyzed';

const getOperationBadgeLabel = (advice?: string) => {
  const normalized = advice?.trim();
  if (!normalized) return '情绪';
  if (normalized.includes('减仓')) return '减仓';
  if (normalized.includes('卖')) return '卖出';
  if (normalized.includes('观望') || normalized.includes('等待')) return '观望';
  if (normalized.includes('买') || normalized.includes('布局')) return '买入';
  return normalized.split(/[，。；、\s]/)[0] || '建议';
};

const normalizeStockCodeKey = (code?: string) => {
  const raw = (code || '').trim().toUpperCase();
  if (!raw) return '';
  const [base] = raw.split('.');
  return base || raw;
};

const RecommendationPage: React.FC = () => {
  const { capabilities } = useAuth();
  const recommendationReadonly = !capabilities.canAnalyzeRecommendation;
  const [sectionMode, setSectionMode] = useState<SectionMode>('pool');
  const [universeKeyword, setUniverseKeyword] = useState('');
  const [universeSortBy, setUniverseSortBy] = useState<'signal' | 'sentiment'>('signal');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [universePage, setUniversePage] = useState(1);
  const [universeIndustryFilters, setUniverseIndustryFilters] = useState<string[]>([]);
  const [universeAreaFilter, setUniverseAreaFilter] = useState('');
  const [expandedIndustries, setExpandedIndustries] = useState<Set<string>>(new Set());
  const [poolQuickFilter, setPoolQuickFilter] = useState<PoolQuickFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [resultScopeFilter, setResultScopeFilter] = useState<ResultScopeFilter>('all');
  const [resultKeyword, setResultKeyword] = useState('');
  const [submittedStockCodes, setSubmittedStockCodes] = useState<Set<string>>(new Set());
  const [hasNewCompleted, setHasNewCompleted] = useState(false);
  const [isPoolPreviewOpen, setIsPoolPreviewOpen] = useState(false);
  const [isPoolPreviewLoading, setIsPoolPreviewLoading] = useState(false);
  const [poolPreviewRecord, setPoolPreviewRecord] = useState<HistoryItem | null>(null);
  const latestSeenRecordIdRef = useRef<number | null>(null);

  const {
    query,
    inputError,
    universeStocks,
    universeSource,
    isLoadingUniverseStocks,
    selectedUniverseStockCodes,
    historyItems,
    selectedReport,
    isLoadingReport,
    markdownDrawerOpen,
    isAnalyzing,
    submitFeedback,
    duplicateError,
    error,
    activeTasks,
    setQuery,
    clearInlineMessages,
    loadUniverseStocks,
    toggleUniverseStockSelection,
    toggleSelectAllUniverseStocks,
    clearUniverseStockSelection,
    submitSelectedUniverseAnalysis,
    clearError,
    loadInitialHistory,
    refreshHistory,
    selectHistoryItem,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    removeTask,
    submitAnalysis,
    openMarkdownDrawer,
    closeMarkdownDrawer,
  } = useStockPoolStore(
    useShallow((state) => ({
      query: state.query,
      inputError: state.inputError,
      universeStocks: state.universeStocks,
      universeSource: state.universeSource,
      isLoadingUniverseStocks: state.isLoadingUniverseStocks,
      selectedUniverseStockCodes: state.selectedUniverseStockCodes,
      historyItems: state.historyItems,
      selectedReport: state.selectedReport,
      isLoadingReport: state.isLoadingReport,
      markdownDrawerOpen: state.markdownDrawerOpen,
      isAnalyzing: state.isAnalyzing,
      submitFeedback: state.submitFeedback,
      duplicateError: state.duplicateError,
      error: state.error,
      activeTasks: state.activeTasks,
      setQuery: state.setQuery,
      clearInlineMessages: state.clearInlineMessages,
      loadUniverseStocks: state.loadUniverseStocks,
      toggleUniverseStockSelection: state.toggleUniverseStockSelection,
      toggleSelectAllUniverseStocks: state.toggleSelectAllUniverseStocks,
      clearUniverseStockSelection: state.clearUniverseStockSelection,
      submitSelectedUniverseAnalysis: state.submitSelectedUniverseAnalysis,
      clearError: state.clearError,
      loadInitialHistory: state.loadInitialHistory,
      refreshHistory: state.refreshHistory,
      selectHistoryItem: state.selectHistoryItem,
      syncTaskCreated: state.syncTaskCreated,
      syncTaskUpdated: state.syncTaskUpdated,
      syncTaskFailed: state.syncTaskFailed,
      removeTask: state.removeTask,
      submitAnalysis: state.submitAnalysis,
      openMarkdownDrawer: state.openMarkdownDrawer,
      closeMarkdownDrawer: state.closeMarkdownDrawer,
    })),
  );

  useDashboardLifecycle({
    loadInitialHistory,
    refreshHistory,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    removeTask,
  });

  useEffect(() => {
    document.title = '筛股 - DSA';
    void loadUniverseStocks();
  }, [loadUniverseStocks]);

  const universeIndustryOptions = useMemo(() => {
    const options = Array.from(new Set(universeStocks.map((item) => (item.industry || '').trim()).filter(Boolean)));
    options.sort((a, b) => a.localeCompare(b));
    return options;
  }, [universeStocks]);

  const universeAreaOptions = useMemo(() => {
    const options = Array.from(new Set(universeStocks.map((item) => (item.area || '').trim()).filter(Boolean)));
    options.sort((a, b) => a.localeCompare(b));
    return options;
  }, [universeStocks]);

  const analyzedStockCodeSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of historyItems) {
      if (item.stockCode) {
        set.add(item.stockCode);
      }
    }
    return set;
  }, [historyItems]);

  const visibleUniverseStocks = useMemo(() => {
    const q = universeKeyword.trim().toLowerCase();
    return universeStocks.filter((item) => {
      const industryMatch = universeIndustryFilters.length === 0 || universeIndustryFilters.includes(item.industry || '');
      const areaMatch = !universeAreaFilter || (item.area || '') === universeAreaFilter;
      const analyzedMatch = poolQuickFilter === 'all' || analyzedStockCodeSet.has(item.stockCode);
      if (!industryMatch || !areaMatch || !analyzedMatch) {
        return false;
      }
      if (!q) {
        return true;
      }
      const fields = [item.stockCode, item.stockName || '', item.industry || '', item.area || '', item.market || '', item.actName || '']
        .map((value) => value.toLowerCase());
      return fields.some((value) => value.includes(q));
    });
  }, [analyzedStockCodeSet, poolQuickFilter, universeKeyword, universeStocks, universeIndustryFilters, universeAreaFilter]);

  const selectedUniverseSet = useMemo(() => new Set(selectedUniverseStockCodes), [selectedUniverseStockCodes]);
  const visibleUniverseCodes = useMemo(() => visibleUniverseStocks.map((item) => item.stockCode), [visibleUniverseStocks]);

  const universeScoreMap = useMemo(() => {
    const scoreMap = new Map<string, { signalScore?: number; sentimentScore?: number }>();
    for (const item of historyItems) {
      const existed = scoreMap.get(item.stockCode);
      if (!existed) {
        scoreMap.set(item.stockCode, { signalScore: item.signalScore, sentimentScore: item.sentimentScore });
        continue;
      }
      const currentSignal = item.signalScore ?? -1;
      const existedSignal = existed.signalScore ?? -1;
      const currentSentiment = item.sentimentScore ?? -1;
      const existedSentiment = existed.sentimentScore ?? -1;
      if (currentSignal > existedSignal || (currentSignal === existedSignal && currentSentiment > existedSentiment)) {
        scoreMap.set(item.stockCode, { signalScore: item.signalScore, sentimentScore: item.sentimentScore });
      }
    }
    return scoreMap;
  }, [historyItems]);

  const universeBasicInfoMap = useMemo(() => {
    const map = new Map<string, {
      industry?: string;
      area?: string;
      market?: string;
      actName?: string;
      listDate?: string;
      actEntType?: string;
    }>();
    for (const item of universeStocks) {
      map.set(item.stockCode, {
        industry: item.industry,
        area: item.area,
        market: item.market,
        actName: item.actName,
        listDate: item.listDate,
        actEntType: item.actEntType,
      });
    }
    return map;
  }, [universeStocks]);

  const sortedUniverseStocks = useMemo(() => {
    const items = [...visibleUniverseStocks];
    items.sort((a, b) => {
      const scoreA = universeScoreMap.get(a.stockCode);
      const scoreB = universeScoreMap.get(b.stockCode);
      const signalA = scoreA?.signalScore ?? -1;
      const signalB = scoreB?.signalScore ?? -1;
      const sentimentA = scoreA?.sentimentScore ?? -1;
      const sentimentB = scoreB?.sentimentScore ?? -1;
      if (universeSortBy === 'signal') {
        if (signalA !== signalB) return signalB - signalA;
        if (sentimentA !== sentimentB) return sentimentB - sentimentA;
      } else {
        if (sentimentA !== sentimentB) return sentimentB - sentimentA;
        if (signalA !== signalB) return signalB - signalA;
      }
      return a.stockCode.localeCompare(b.stockCode);
    });
    return items;
  }, [visibleUniverseStocks, universeScoreMap, universeSortBy]);

  const pagedUniverseStocks = useMemo(() => {
    const start = (universePage - 1) * UNIVERSE_PAGE_SIZE;
    return sortedUniverseStocks.slice(start, start + UNIVERSE_PAGE_SIZE);
  }, [sortedUniverseStocks, universePage]);

  const groupedUniverseStocks = useMemo(() => {
    const groups = new Map<string, typeof sortedUniverseStocks>();
    for (const item of sortedUniverseStocks) {
      const key = (item.industry || '未分类').trim() || '未分类';
      const existed = groups.get(key);
      if (existed) {
        existed.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return Array.from(groups.entries())
      .map(([industry, items]) => ({ industry, items }))
      .sort((a, b) => {
        if (a.items.length !== b.items.length) return b.items.length - a.items.length;
        return a.industry.localeCompare(b.industry);
      });
  }, [sortedUniverseStocks]);

  const universeTotalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedUniverseStocks.length / UNIVERSE_PAGE_SIZE)),
    [sortedUniverseStocks.length],
  );

  const activeTaskStatusMap = useMemo(() => {
    const map = new Map<string, TaskInfoStatus>();
    for (const task of activeTasks) {
      map.set(task.stockCode, task.status as TaskInfoStatus);
    }
    return map;
  }, [activeTasks]);

  const latestHistoryByCode = useMemo(() => {
    const map = new Map<string, HistoryItem>();
    for (const item of historyItems) {
      const existed = map.get(item.stockCode);
      if (!existed) {
        map.set(item.stockCode, item);
        continue;
      }
      const currentTs = new Date(item.createdAt).getTime();
      const existedTs = new Date(existed.createdAt).getTime();
      if (currentTs > existedTs || (currentTs === existedTs && (item.id ?? 0) > (existed.id ?? 0))) {
        map.set(item.stockCode, item);
      }
    }
    return map;
  }, [historyItems]);

  const recommendationResults = useMemo(() => {
    const filtered = historyItems.filter((item) => {
      const itemCodeKey = normalizeStockCodeKey(item.stockCode);
      if (resultScopeFilter === 'submitted' && !submittedStockCodes.has(itemCodeKey)) {
        return false;
      }
      const taskStatus = activeTaskStatusMap.get(item.stockCode);
      const status: TaskInfoStatus = taskStatus ?? 'completed';
      if (resultFilter === 'all') return true;
      return status === resultFilter;
    });
    return [...filtered].sort((a, b) => {
      const aSubmitted = submittedStockCodes.has(normalizeStockCodeKey(a.stockCode)) ? 1 : 0;
      const bSubmitted = submittedStockCodes.has(normalizeStockCodeKey(b.stockCode)) ? 1 : 0;
      if (aSubmitted !== bSubmitted) return bSubmitted - aSubmitted;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [activeTaskStatusMap, historyItems, resultFilter, resultScopeFilter, submittedStockCodes]);

  const visibleRecommendationResults = useMemo(() => {
    const keyword = resultKeyword.trim().toLowerCase();
    if (!keyword) {
      return recommendationResults;
    }
    return recommendationResults.filter((item) => {
      const fields = [item.stockCode, item.stockName || '', item.operationAdvice || '', item.trendPrediction || '']
        .map((value) => value.toLowerCase());
      return fields.some((value) => value.includes(keyword));
    });
  }, [recommendationResults, resultKeyword]);

  const selectedReportWithFallback = useMemo(() => {
    if (!selectedReport) return null;
    const fallback = universeBasicInfoMap.get(selectedReport.meta.stockCode);
    if (!fallback) return selectedReport;
    return {
      ...selectedReport,
      meta: {
        ...selectedReport.meta,
        industry: selectedReport.meta.industry || fallback.industry,
        area: selectedReport.meta.area || fallback.area,
        market: selectedReport.meta.market || fallback.market,
        actName: selectedReport.meta.actName || fallback.actName,
      },
    };
  }, [selectedReport, universeBasicInfoMap]);

  useEffect(() => {
    setUniversePage(1);
  }, [universeKeyword, universeSortBy, universeIndustryFilters, universeAreaFilter, poolQuickFilter]);

  useEffect(() => {
    if (universePage > universeTotalPages) {
      setUniversePage(universeTotalPages);
    }
  }, [universePage, universeTotalPages]);

  useEffect(() => {
    if (groupedUniverseStocks.length > 0 && expandedIndustries.size === 0) {
      setExpandedIndustries(new Set(groupedUniverseStocks.slice(0, 3).map((group) => group.industry)));
    }
  }, [groupedUniverseStocks, expandedIndustries.size]);

  useEffect(() => {
    const latest = historyItems[0];
    if (!latest || latest.id == null) return;
    if (latestSeenRecordIdRef.current == null) {
      latestSeenRecordIdRef.current = latest.id;
      return;
    }
    if (
      latest.id !== latestSeenRecordIdRef.current
      && submittedStockCodes.has(normalizeStockCodeKey(latest.stockCode))
    ) {
      setHasNewCompleted(true);
      latestSeenRecordIdRef.current = latest.id;
    }
  }, [historyItems, submittedStockCodes]);

  const toggleUniverseIndustryFilter = useCallback((industry: string) => {
    setUniverseIndustryFilters((prev) => {
      if (prev.includes(industry)) {
        return prev.filter((item) => item !== industry);
      }
      return [...prev, industry];
    });
  }, []);

  const toggleIndustryExpand = useCallback((industry: string) => {
    setExpandedIndustries((prev) => {
      const next = new Set(prev);
      if (next.has(industry)) {
        next.delete(industry);
      } else {
        next.add(industry);
      }
      return next;
    });
  }, []);

  const handleSubmitSingle = useCallback(async () => {
    if (recommendationReadonly) {
      return;
    }
    await submitAnalysis({
      stockCode: query,
      originalQuery: `recommendation:${query}`,
      selectionSource: 'manual',
    });
    const codeKey = normalizeStockCodeKey(query);
    if (codeKey) {
      setSubmittedStockCodes((prev) => new Set([...prev, codeKey]));
      setSectionMode('results');
      setResultFilter('all');
      setResultScopeFilter('submitted');
    }
  }, [query, recommendationReadonly, submitAnalysis]);

  const handleSubmitSelected = useCallback(async () => {
    if (recommendationReadonly) {
      return;
    }
    const snapshot = Array.from(new Set(selectedUniverseStockCodes));
    if (snapshot.length === 0) return;
    await submitSelectedUniverseAnalysis(snapshot);
    setSubmittedStockCodes((prev) => {
      const next = new Set(prev);
      for (const code of snapshot) {
        const codeKey = normalizeStockCodeKey(code);
        if (codeKey) {
          next.add(codeKey);
        }
      }
      return next;
    });
    setSectionMode('results');
    setResultFilter('all');
    setResultScopeFilter('submitted');
  }, [recommendationReadonly, selectedUniverseStockCodes, submitSelectedUniverseAnalysis]);

  const handleSelectResult = useCallback(async (item: HistoryItem) => {
    if (item.id == null) return;
    await selectHistoryItem(item.id);
  }, [selectHistoryItem]);

  const handleOpenPoolPreview = useCallback(async (item: HistoryItem) => {
    if (item.id == null) return;
    setPoolPreviewRecord(item);
    setIsPoolPreviewOpen(true);
    setIsPoolPreviewLoading(true);
    try {
      await selectHistoryItem(item.id);
    } finally {
      setIsPoolPreviewLoading(false);
    }
  }, [selectHistoryItem]);

  const handleClosePoolPreview = useCallback(() => {
    setIsPoolPreviewOpen(false);
  }, []);

  const handleOpenFullReportFromPool = useCallback(async (item: HistoryItem) => {
    if (item.id == null) return;
    await selectHistoryItem(item.id);
    openMarkdownDrawer();
  }, [openMarkdownDrawer, selectHistoryItem]);

  const handleOpenFullReport = useCallback(async () => {
    if (!poolPreviewRecord?.id) return;
    await selectHistoryItem(poolPreviewRecord.id);
    setIsPoolPreviewOpen(false);
    setSectionMode('results');
    openMarkdownDrawer();
  }, [openMarkdownDrawer, poolPreviewRecord, selectHistoryItem]);

  const handleJumpLatest = useCallback(async () => {
    const latest = visibleRecommendationResults[0];
    if (!latest || latest.id == null) return;
    setHasNewCompleted(false);
    latestSeenRecordIdRef.current = latest.id;
    await selectHistoryItem(latest.id);
  }, [selectHistoryItem, visibleRecommendationResults]);

  const pendingCount = activeTasks.filter((task) => task.status === 'pending').length;
  const processingCount = activeTasks.filter((task) => task.status === 'processing').length;
  const formatAnalysisTime = (value?: string) => {
    if (!value) return '--';
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return value;
    return new Date(ts).toLocaleString('zh-CN');
  };

  const formatListDate = (value?: string) => {
    const text = (value || '').trim();
    if (!text) return '--';
    if (/^\d{8}$/.test(text)) {
      return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    }
    return text;
  };

  const resolvePoolBasicInfo = useCallback((stockCode: string, item: (typeof universeStocks)[number]) => {
    const infoFromPool = universeBasicInfoMap.get(stockCode);
    if (infoFromPool) {
      if (
        infoFromPool.industry
        || infoFromPool.area
        || infoFromPool.market
        || infoFromPool.actName
        || infoFromPool.listDate
        || infoFromPool.actEntType
      ) {
        return infoFromPool;
      }
    }
    if (selectedReportWithFallback?.meta.stockCode === stockCode) {
      return {
        industry: selectedReportWithFallback.meta.industry,
        area: selectedReportWithFallback.meta.area,
        market: selectedReportWithFallback.meta.market,
        actName: selectedReportWithFallback.meta.actName,
        listDate: selectedReportWithFallback.meta.listDate,
        actEntType: selectedReportWithFallback.meta.actEntType,
      };
    }
    return {
      industry: item.industry,
      area: item.area,
      market: item.market,
      actName: item.actName,
      listDate: item.listDate,
      actEntType: item.actEntType,
    };
  }, [selectedReportWithFallback, universeBasicInfoMap]);

  const previewReport = useMemo(() => {
    if (!poolPreviewRecord?.id) return null;
    if (selectedReportWithFallback?.meta.id === poolPreviewRecord.id) {
      return selectedReportWithFallback;
    }
    if (selectedReport?.meta.id === poolPreviewRecord.id) {
      return selectedReport;
    }
    return null;
  }, [poolPreviewRecord, selectedReport, selectedReportWithFallback]);

  const activeReportLanguage = normalizeReportLanguage(
    selectedReportWithFallback?.meta.reportLanguage || selectedReport?.meta.reportLanguage,
  );

  return (
    <div className="space-y-4 px-3 pb-4 pt-2 md:px-4 md:pt-3">
      <div className="rounded-xl border border-subtle bg-surface/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">筛股</h2>
            <p className="text-xs text-secondary-text">
              全A勾选分析与结果查看闭环：提交后可直接在本页查看任务状态和报告详情。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs ${sectionMode === 'pool' ? 'bg-primary/15 text-foreground' : 'text-secondary-text hover:bg-hover'}`}
              onClick={() => setSectionMode('pool')}
            >
              股票池
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs ${sectionMode === 'results' ? 'bg-primary/15 text-foreground' : 'text-secondary-text hover:bg-hover'}`}
              onClick={() => setSectionMode('results')}
            >
              分析结果
            </button>
          </div>
        </div>

        {error ? <ApiErrorAlert error={error} className="mb-3" onDismiss={clearError} /> : null}
        {duplicateError ? (
          <InlineAlert
            variant="warning"
            title="存在重复任务"
            message={duplicateError}
            className="mb-3 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        ) : null}
        {submitFeedback ? (
          <InlineAlert
            variant="success"
            title="提交结果"
            message={submitFeedback}
            className="mb-3 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        ) : null}
        {inputError ? (
          <InlineAlert
            variant="danger"
            title="输入有误"
            message={inputError}
            className="mb-3 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        ) : null}
        {recommendationReadonly ? (
          <InlineAlert
            variant="warning"
            title="当前账号为只读模式"
            message="普通用户仅可查看筛股结果，不可提交筛股或批量分析任务。"
            className="mb-3 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        ) : null}

        {sectionMode === 'pool' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  clearInlineMessages();
                }}
                placeholder="输入单只股票代码后可直接分析，如 600519、000001"
                className="input-surface input-focus-glow h-9 min-w-56 flex-1 rounded-lg border bg-transparent px-3 text-sm"
              />
              <button
                type="button"
                className="btn-primary h-9 px-3 text-xs"
                onClick={handleSubmitSingle}
                disabled={recommendationReadonly || !query || isAnalyzing}
              >
                {isAnalyzing ? '提交中...' : '分析输入股票'}
              </button>
              <button
                type="button"
                className="btn-secondary h-9 px-3 text-xs"
                onClick={() => void loadUniverseStocks()}
                disabled={isLoadingUniverseStocks}
              >
                {isLoadingUniverseStocks ? '加载中...' : '刷新股票池'}
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-subtle bg-base/40 px-3 py-2 text-xs text-secondary-text">
              <span>已加载 {universeStocks.length} 只</span>
              <span>|</span>
              <span>来源 {universeSource || '--'}</span>
              <span>|</span>
              <span>已选 {selectedUniverseStockCodes.length} 只</span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={universeKeyword}
                onChange={(e) => setUniverseKeyword(e.target.value)}
                placeholder="筛选代码/名称/行业/地域/市场/实控人名称"
                className="input-surface input-focus-glow h-9 min-w-56 flex-1 rounded-lg border bg-transparent px-3 text-sm"
              />
              <select
                value={universeAreaFilter}
                onChange={(e) => setUniverseAreaFilter(e.target.value)}
                className="input-surface h-9 min-w-28 rounded-lg border bg-transparent px-2 text-xs"
              >
                <option value="">全部地域</option>
                {universeAreaOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-subtle bg-base/40 px-2 py-2">
              <span className="px-1 text-[11px] text-secondary-text">行业（多选）:</span>
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] ${universeIndustryFilters.length === 0 ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                onClick={() => setUniverseIndustryFilters([])}
              >
                全部行业
              </button>
              {universeIndustryOptions.map((item) => {
                const active = universeIndustryFilters.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${active ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                    onClick={() => toggleUniverseIndustryFilter(item)}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle bg-base/40 px-3 py-2 text-xs text-secondary-text">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visibleUniverseCodes.length > 0 && visibleUniverseCodes.every((code) => selectedUniverseSet.has(code))}
                  onChange={() => toggleSelectAllUniverseStocks(visibleUniverseCodes)}
                />
                全选当前筛选结果
              </label>
              <div className="flex items-center gap-2">
                <span>排序：</span>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 ${universeSortBy === 'signal' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                  onClick={() => setUniverseSortBy('signal')}
                >
                  信号分优先
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 ${universeSortBy === 'sentiment' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                  onClick={() => setUniverseSortBy('sentiment')}
                >
                  情绪分优先
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-subtle bg-base/40 px-3 py-2 text-xs text-secondary-text">
              <div className="flex items-center gap-2">
                <span>视图：</span>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 ${viewMode === 'list' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                  onClick={() => setViewMode('list')}
                >
                  平铺列表
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 ${viewMode === 'industry' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                  onClick={() => setViewMode('industry')}
                >
                  按行业分组
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <span>筛选：</span>
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 ${poolQuickFilter === 'all' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                    onClick={() => setPoolQuickFilter('all')}
                  >
                    全部股票
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 ${poolQuickFilter === 'analyzed' ? 'bg-primary/15 text-foreground' : 'hover:bg-hover'}`}
                    onClick={() => setPoolQuickFilter('analyzed')}
                  >
                    仅已分析
                  </button>
                </div>
                {viewMode === 'industry' ? (
                  <>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 hover:bg-hover"
                      onClick={() => setExpandedIndustries(new Set(groupedUniverseStocks.map((group) => group.industry)))}
                    >
                      全部展开
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 hover:bg-hover"
                      onClick={() => setExpandedIndustries(new Set())}
                    >
                      全部收起
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto rounded-lg border border-subtle">
              {isLoadingUniverseStocks ? (
                <div className="p-6 text-center text-sm text-secondary-text">正在加载全A股票池...</div>
              ) : visibleUniverseStocks.length === 0 ? (
                <div className="p-6 text-center text-sm text-secondary-text">暂无匹配股票</div>
              ) : viewMode === 'list' ? (
                <div className="divide-y divide-subtle">
                  {pagedUniverseStocks.map((item) => {
                    const score = universeScoreMap.get(item.stockCode);
                    const latestHistory = latestHistoryByCode.get(item.stockCode);
                    const basicInfo = resolvePoolBasicInfo(item.stockCode, item);
                    return (
                      <div key={item.stockCode} className="flex items-center gap-3 px-3 py-2 hover:bg-hover/60">
                        <input
                          type="checkbox"
                          checked={selectedUniverseSet.has(item.stockCode)}
                          onChange={() => toggleUniverseStockSelection(item.stockCode)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium text-foreground">
                              {item.stockName || item.stockCode}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                                      {score?.sentimentScore != null ? (
                                        <span
                                          className="rec-score-chip"
                                          style={{
                                            color: getSentimentColor(score.sentimentScore),
                                            borderColor: `${getSentimentColor(score.sentimentScore)}30`,
                                            backgroundColor: `${getSentimentColor(score.sentimentScore)}10`,
                                          }}
                                        >
                                          {getOperationBadgeLabel(latestHistory?.operationAdvice)} <strong>{score.sentimentScore}</strong>
                                        </span>
                                      ) : (
                                        <span className="rec-score-chip rec-score-chip-sentiment">情绪分 <strong>--</strong></span>
                                      )}
                                      {score?.signalScore != null ? (
                                        <span
                                          className="rec-score-chip"
                                          style={{
                                            color: getSentimentColor(score.signalScore),
                                            borderColor: `${getSentimentColor(score.signalScore)}30`,
                                            backgroundColor: `${getSentimentColor(score.signalScore)}10`,
                                          }}
                                        >
                                          信号 <strong>{score.signalScore}</strong>
                                        </span>
                                      ) : (
                                        <span className="rec-score-chip rec-score-chip-signal">信号分 <strong>--</strong></span>
                                      )}
                            </div>
                          </div>
                          <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-muted-text md:grid-cols-2 xl:grid-cols-4">
                            <span className="font-mono">代码: {item.stockCode}</span>
                            <span>行业: {basicInfo.industry || '--'}</span>
                            <span>地域: {basicInfo.area || '--'}</span>
                            <span>市场: {basicInfo.market || '--'}</span>
                            <span>上市: {formatListDate(basicInfo.listDate)}</span>
                            <span>实控人: {basicInfo.actName || '--'}</span>
                            <span>实控类型: {basicInfo.actEntType || '--'}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-secondary-text">
                            <span>分析时间: {formatAnalysisTime(latestHistory?.createdAt)}</span>
                            <button
                              type="button"
                              className={`rounded-md border px-2 py-0.5 ${
                                latestHistory?.id
                                  ? 'border-subtle text-primary hover:bg-hover'
                                  : 'border-subtle/70 text-muted-text'
                              }`}
                              disabled={!latestHistory?.id}
                              onClick={() => {
                                if (!latestHistory?.id) return;
                                void handleOpenFullReportFromPool(latestHistory);
                              }}
                            >
                              {latestHistory?.id ? '完整分析报告' : '暂无报告'}
                            </button>
                            <button
                              type="button"
                              className={`rounded-md border px-2 py-0.5 ${
                                latestHistory?.id
                                  ? 'border-subtle text-primary hover:bg-hover'
                                  : 'border-subtle/70 text-muted-text'
                              }`}
                              disabled={!latestHistory?.id}
                              onClick={() => {
                                if (!latestHistory?.id) return;
                                void handleOpenPoolPreview(latestHistory);
                              }}
                            >
                              {latestHistory?.id ? '查看分析结果' : '暂无结果'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-subtle">
                  {groupedUniverseStocks.map((group) => {
                    const groupCodes = group.items.map((item) => item.stockCode);
                    const selectedCount = groupCodes.filter((code) => selectedUniverseSet.has(code)).length;
                    const expanded = expandedIndustries.has(group.industry);
                    const allInGroupSelected = groupCodes.length > 0 && groupCodes.every((code) => selectedUniverseSet.has(code));
                    return (
                      <div key={group.industry}>
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <button
                            type="button"
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-hover"
                            onClick={() => toggleIndustryExpand(group.industry)}
                          >
                            <span className="text-xs">{expanded ? '▾' : '▸'}</span>
                            <span className="text-sm font-medium text-foreground">{group.industry}</span>
                            <span className="text-xs text-secondary-text">
                              {selectedCount}/{group.items.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-subtle px-2 py-1 text-xs text-secondary-text hover:bg-hover"
                            onClick={() => toggleSelectAllUniverseStocks(groupCodes)}
                          >
                            {allInGroupSelected ? '取消本组全选' : '全选本组'}
                          </button>
                        </div>
                        {expanded ? (
                          <div className="divide-y divide-subtle/70 border-t border-subtle/70">
                            {group.items.map((item) => {
                              const score = universeScoreMap.get(item.stockCode);
                              const latestHistory = latestHistoryByCode.get(item.stockCode);
                              const basicInfo = resolvePoolBasicInfo(item.stockCode, item);
                              return (
                                <div key={item.stockCode} className="flex items-center gap-3 px-3 py-2 hover:bg-hover/60">
                                  <input
                                    type="checkbox"
                                    checked={selectedUniverseSet.has(item.stockCode)}
                                    onChange={() => toggleUniverseStockSelection(item.stockCode)}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="truncate text-sm font-medium text-foreground">
                                        {item.stockName || item.stockCode}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                                        {score?.sentimentScore != null ? (
                                          <span
                                            className="rec-score-chip"
                                            style={{
                                              color: getSentimentColor(score.sentimentScore),
                                              borderColor: `${getSentimentColor(score.sentimentScore)}30`,
                                              backgroundColor: `${getSentimentColor(score.sentimentScore)}10`,
                                            }}
                                          >
                                            {getOperationBadgeLabel(latestHistory?.operationAdvice)} <strong>{score.sentimentScore}</strong>
                                          </span>
                                        ) : (
                                          <span className="rec-score-chip rec-score-chip-sentiment">情绪分 <strong>--</strong></span>
                                        )}
                                        {score?.signalScore != null ? (
                                          <span
                                            className="rec-score-chip"
                                            style={{
                                              color: getSentimentColor(score.signalScore),
                                              borderColor: `${getSentimentColor(score.signalScore)}30`,
                                              backgroundColor: `${getSentimentColor(score.signalScore)}10`,
                                            }}
                                          >
                                            信号 <strong>{score.signalScore}</strong>
                                          </span>
                                        ) : (
                                          <span className="rec-score-chip rec-score-chip-signal">信号分 <strong>--</strong></span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-muted-text md:grid-cols-2 xl:grid-cols-4">
                                      <span className="font-mono">代码: {item.stockCode}</span>
                                      <span>行业: {basicInfo.industry || '--'}</span>
                                      <span>地域: {basicInfo.area || '--'}</span>
                                      <span>市场: {basicInfo.market || '--'}</span>
                                      <span>上市: {formatListDate(basicInfo.listDate)}</span>
                                      <span>实控人: {basicInfo.actName || '--'}</span>
                                      <span>实控类型: {basicInfo.actEntType || '--'}</span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-secondary-text">
                                      <span>分析时间: {formatAnalysisTime(latestHistory?.createdAt)}</span>
                                      <button
                                        type="button"
                                        className={`rounded-md border px-2 py-0.5 ${
                                          latestHistory?.id
                                            ? 'border-subtle text-primary hover:bg-hover'
                                            : 'border-subtle/70 text-muted-text'
                                        }`}
                                        disabled={!latestHistory?.id}
                                        onClick={() => {
                                          if (!latestHistory?.id) return;
                                          void handleOpenFullReportFromPool(latestHistory);
                                        }}
                                      >
                                        {latestHistory?.id ? '完整分析报告' : '暂无报告'}
                                      </button>
                                      <button
                                        type="button"
                                        className={`rounded-md border px-2 py-0.5 ${
                                          latestHistory?.id
                                            ? 'border-subtle text-primary hover:bg-hover'
                                            : 'border-subtle/70 text-muted-text'
                                        }`}
                                        disabled={!latestHistory?.id}
                                        onClick={() => {
                                          if (!latestHistory?.id) return;
                                          void handleOpenPoolPreview(latestHistory);
                                        }}
                                      >
                                        {latestHistory?.id ? '查看分析结果' : '暂无结果'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {viewMode === 'list' ? (
              <div className="mt-3 flex items-center justify-between text-xs text-secondary-text">
                <span>第 {universePage}/{universeTotalPages} 页（每页 {UNIVERSE_PAGE_SIZE} 条）</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary h-8 px-2 text-xs"
                    onClick={() => setUniversePage((p) => Math.max(1, p - 1))}
                    disabled={universePage <= 1}
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-8 px-2 text-xs"
                    onClick={() => setUniversePage((p) => Math.min(universeTotalPages, p + 1))}
                    disabled={universePage >= universeTotalPages}
                  >
                    下一页
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                className="btn-secondary h-9 px-3 text-xs"
                onClick={clearUniverseStockSelection}
                disabled={selectedUniverseStockCodes.length === 0}
              >
                清空勾选
              </button>
              <button
                type="button"
                className="btn-primary h-9 px-3 text-xs"
                onClick={() => void handleSubmitSelected()}
                disabled={recommendationReadonly || selectedUniverseStockCodes.length === 0 || isAnalyzing}
              >
                {isAnalyzing ? '提交中...' : `分析已勾选 (${selectedUniverseStockCodes.length})`}
              </button>
            </div>
          </>
        ) : (
          <div className="grid min-h-[60vh] grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="space-y-3 xl:col-span-5">
              <TaskPanel tasks={activeTasks} />
              <div className="rounded-lg border border-subtle bg-base/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-secondary-text">
                    排队 {pendingCount} | 进行中 {processingCount} | 结果 {visibleRecommendationResults.length}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasNewCompleted ? (
                      <button
                        type="button"
                        className="rounded-md border border-subtle px-2 py-1 text-xs text-primary hover:bg-hover"
                        onClick={() => void handleJumpLatest()}
                      >
                        跳转最新
                      </button>
                    ) : null}
                    <Button variant="home-action-ai" size="sm" onClick={() => void refreshHistory(true)}>
                      刷新
                    </Button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {(['all', 'pending', 'processing', 'completed', 'failed'] as ResultFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`rounded-md px-2 py-1 text-xs ${resultFilter === filter ? 'bg-primary/15 text-foreground' : 'text-secondary-text hover:bg-hover'}`}
                      onClick={() => setResultFilter(filter)}
                    >
                      {filter === 'all' ? '全部' : filter === 'pending' ? '等待中' : filter === 'processing' ? '分析中' : filter === 'completed' ? '已完成' : '失败'}
                    </button>
                  ))}
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs ${resultScopeFilter === 'all' ? 'bg-primary/15 text-foreground' : 'text-secondary-text hover:bg-hover'}`}
                    onClick={() => setResultScopeFilter('all')}
                  >
                    全部批次
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs ${resultScopeFilter === 'submitted' ? 'bg-primary/15 text-foreground' : 'text-secondary-text hover:bg-hover'}`}
                    onClick={() => setResultScopeFilter('submitted')}
                  >
                    仅本次提交
                  </button>
                </div>
                <div className="mb-2">
                  <input
                    type="text"
                    value={resultKeyword}
                    onChange={(e) => setResultKeyword(e.target.value)}
                    placeholder="按代码/名称/建议搜索结果，如 000002、万科"
                    className="input-surface input-focus-glow h-8 w-full rounded-md border bg-transparent px-2 text-xs"
                  />
                </div>
                <div className="max-h-[48vh] overflow-y-auto rounded-lg border border-subtle">
                  {visibleRecommendationResults.length === 0 ? (
                    <div className="p-6 text-center text-sm text-secondary-text">
                      {recommendationResults.length === 0
                        ? '暂无结果，先在“股票池”里提交分析任务。'
                        : '暂无匹配结果，请调整搜索关键词。'}
                    </div>
                  ) : (
                    <div className="divide-y divide-subtle">
                      {visibleRecommendationResults.map((item) => {
                        const isSelected = selectedReport?.meta.id === item.id;
                        const taskStatus = activeTaskStatusMap.get(item.stockCode);
                        const status = taskStatus ?? 'completed';
                        const fallback = universeBasicInfoMap.get(item.stockCode);
                        return (
                          <div
                            key={`${item.id}-${item.stockCode}`}
                            className={`w-full px-3 py-2 text-left transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-hover/70'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => void handleSelectResult(item)}
                              >
                                <div className="truncate text-sm font-medium text-foreground">{item.stockName || item.stockCode}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-text">
                                  <span className="font-mono">{item.stockCode}</span>
                                  {item.sentimentScore != null ? (
                                    <span
                                      className="rec-score-chip"
                                      style={{
                                        color: getSentimentColor(item.sentimentScore),
                                        borderColor: `${getSentimentColor(item.sentimentScore)}30`,
                                        backgroundColor: `${getSentimentColor(item.sentimentScore)}10`,
                                      }}
                                    >
                                      {getOperationBadgeLabel(item.operationAdvice)} <strong>{item.sentimentScore}</strong>
                                    </span>
                                  ) : (
                                    <span className="rec-score-chip rec-score-chip-sentiment">情绪分 <strong>--</strong></span>
                                  )}
                                  {item.signalScore != null ? (
                                    <span
                                      className="rec-score-chip"
                                      style={{
                                        color: getSentimentColor(item.signalScore),
                                        borderColor: `${getSentimentColor(item.signalScore)}30`,
                                        backgroundColor: `${getSentimentColor(item.signalScore)}10`,
                                      }}
                                    >
                                      信号 <strong>{item.signalScore}</strong>
                                    </span>
                                  ) : (
                                    <span className="rec-score-chip rec-score-chip-signal">信号分 <strong>--</strong></span>
                                  )}
                                  <span>分析时间: {formatAnalysisTime(item.createdAt)}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-text">
                                  <span className="rec-insight-chip">
                                    <span className="rec-insight-chip-label">操作建议</span>
                                    <span className="rec-insight-chip-value">{item.operationAdvice || '--'}</span>
                                  </span>
                                  <span className="rec-insight-chip">
                                    <span className="rec-insight-chip-label">趋势预测</span>
                                    <span className="rec-insight-chip-value">{item.trendPrediction || '--'}</span>
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-text">
                                  <span>行业: {fallback?.industry || '--'}</span>
                                  <span>地域: {fallback?.area || '--'}</span>
                                  <span>市场: {fallback?.market || '--'}</span>
                                  <span>上市: {formatListDate(fallback?.listDate)}</span>
                                  <span>实控人: {fallback?.actName || '--'}</span>
                                  <span>实控类型: {fallback?.actEntType || '--'}</span>
                                </div>
                              </button>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-[11px] text-secondary-text">
                                  {status === 'pending' ? '等待中' : status === 'processing' ? '分析中' : status === 'failed' ? '失败' : '已完成'}
                                </span>
                                <button
                                  type="button"
                                  className="rounded-md border border-subtle px-2 py-1 text-[11px] text-primary hover:bg-hover"
                                  onClick={() => void handleSelectResult(item)}
                                >
                                  查看详情
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="xl:col-span-7">
              {isLoadingReport ? (
                <div className="flex min-h-[56vh] items-center justify-center rounded-lg border border-subtle bg-base/30">
                  <DashboardStateBlock title="加载报告中..." loading />
                </div>
              ) : selectedReport ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-subtle bg-base/40 px-3 py-2 text-xs text-secondary-text">
                    分析时间：{formatAnalysisTime(selectedReport.meta.createdAt)}
                  </div>
                  <ReportSummary data={selectedReportWithFallback || selectedReport} isHistory />
                </div>
              ) : (
                <div className="flex min-h-[56vh] items-center justify-center rounded-lg border border-subtle bg-base/30 text-sm text-secondary-text">
                  从左侧选择一条分析结果查看详情。
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <Drawer
        isOpen={isPoolPreviewOpen}
        onClose={handleClosePoolPreview}
        title={`${poolPreviewRecord?.stockName || poolPreviewRecord?.stockCode || '股票'} 分析结果`}
        width="max-w-[86rem]"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-subtle bg-base/40 px-3 py-2">
            <div className="text-xs text-secondary-text">
              分析时间：{formatAnalysisTime(poolPreviewRecord?.createdAt)}
            </div>
            <button
              type="button"
              className="rounded-md border border-subtle px-2 py-1 text-xs text-primary hover:bg-hover"
              onClick={() => void handleOpenFullReport()}
              disabled={!poolPreviewRecord?.id}
            >
              查看完整分析报告
            </button>
          </div>
          {isPoolPreviewLoading || (isLoadingReport && previewReport == null) ? (
            <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-subtle bg-base/30">
              <DashboardStateBlock title="加载报告中..." loading />
            </div>
          ) : previewReport ? (
            <ReportSummary data={previewReport} isHistory />
          ) : (
            <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-subtle bg-base/30 text-sm text-secondary-text">
              暂无可展示的分析结果，请稍后重试。
            </div>
          )}
        </div>
      </Drawer>
      {markdownDrawerOpen && selectedReport?.meta.id ? (
        <ReportMarkdown
          recordId={selectedReport.meta.id}
          stockName={selectedReport.meta.stockName || ''}
          stockCode={selectedReport.meta.stockCode}
          reportLanguage={activeReportLanguage}
          onClose={closeMarkdownDrawer}
        />
      ) : null}
    </div>
  );
};

export default RecommendationPage;
