import { create } from 'zustand';
import { analysisApi, DuplicateTaskError } from '../api/analysis';
import type { ParsedApiError } from '../api/error';
import { getParsedApiError } from '../api/error';
import { historyApi } from '../api/history';
import type {
  AnalysisReport,
  HistoryItem,
  HistoryListResponse,
  TaskInfo,
  UniverseStockItem,
} from '../types/analysis';
import { getRecentStartDate, getTodayInShanghai } from '../utils/format';
import { isObviouslyInvalidStockQuery, looksLikeStockCode, validateStockCode } from '../utils/validation';

const PAGE_SIZE = 20;

type SelectionSource = 'manual' | 'autocomplete' | 'import' | 'image';
type HistoryWindowDays = 30 | 90 | null;
type HistoryBatchId = string | null;

type FetchHistoryOptions = {
  autoSelectFirst?: boolean;
  reset?: boolean;
  silent?: boolean;
};

type SubmitAnalysisOptions = {
  stockCode?: string;
  stockName?: string;
  originalQuery?: string;
  selectionSource?: SelectionSource;
  notify?: boolean;
  forceRefresh?: boolean;
};

let reportRequestSeq = 0;
let analyzeRequestSeq = 0;
let historyRequestSeq = 0;
const dismissedTaskIds = new Set<string>();

export interface StockPoolState {
  query: string;
  selectionSource: SelectionSource;
  notify: boolean;
  inputError?: string;
  duplicateError: string | null;
  submitFeedback: string | null;
  error: ParsedApiError | null;
  isAnalyzing: boolean;
  historyItems: HistoryItem[];
  selectedHistoryIds: number[];
  isDeletingHistory: boolean;
  isLoadingHistory: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  currentPage: number;
  historyTotal: number;
  isLoadingAllHistory: boolean;
  historyWindowDays: HistoryWindowDays;
  currentBatchId: HistoryBatchId;
  selectedReport: AnalysisReport | null;
  isLoadingReport: boolean;
  activeTasks: TaskInfo[];
  universeStocks: UniverseStockItem[];
  universeSource: 'tushare' | 'fallback_file' | 'none' | null;
  isLoadingUniverseStocks: boolean;
  selectedUniverseStockCodes: string[];
  markdownDrawerOpen: boolean;
  canAnalyzeRecommendation: boolean;
  canAnalyzeBatch: boolean;
  setQuery: (query: string) => void;
  clearError: () => void;
  clearInlineMessages: () => void;
  openMarkdownDrawer: () => void;
  closeMarkdownDrawer: () => void;
  setAnalysisCapabilities: (caps: { canAnalyzeRecommendation: boolean; canAnalyzeBatch: boolean }) => void;
  loadInitialHistory: () => Promise<void>;
  refreshHistory: (silent?: boolean) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  loadAllHistory: () => Promise<void>;
  setHistoryWindowDays: (days: HistoryWindowDays) => Promise<void>;
  selectHistoryItem: (recordId: number) => Promise<void>;
  toggleHistorySelection: (recordId: number) => void;
  toggleSelectAllVisible: () => void;
  deleteSelectedHistory: () => Promise<void>;
  setCurrentBatchId: (batchId: HistoryBatchId) => Promise<void>;
  submitAnalysis: (options?: SubmitAnalysisOptions) => Promise<string | null>;
  submitAllAShareAnalysis: () => Promise<void>;
  loadUniverseStocks: () => Promise<void>;
  toggleUniverseStockSelection: (stockCode: string) => void;
  toggleSelectAllUniverseStocks: (stockCodes: string[]) => void;
  clearUniverseStockSelection: () => void;
  submitSelectedUniverseAnalysis: (stockCodes?: string[]) => Promise<string | null>;
  setNotify: (notify: boolean) => void;
  syncTaskCreated: (task: TaskInfo) => void;
  syncTaskUpdated: (task: TaskInfo) => void;
  syncTaskFailed: (task: TaskInfo) => void;
  removeTask: (taskId: string) => void;
  resetDashboardState: () => void;
}

const initialState = {
  query: '',
  selectionSource: 'manual' as SelectionSource,
  notify: true,
  inputError: undefined,
  duplicateError: null,
  submitFeedback: null,
  error: null,
  isAnalyzing: false,
  historyItems: [] as HistoryItem[],
  selectedHistoryIds: [] as number[],
  isDeletingHistory: false,
  isLoadingHistory: false,
  isLoadingMore: false,
  hasMore: true,
  currentPage: 1,
  historyTotal: 0,
  isLoadingAllHistory: false,
  historyWindowDays: 30 as HistoryWindowDays,
  currentBatchId: null as HistoryBatchId,
  selectedReport: null as AnalysisReport | null,
  isLoadingReport: false,
  activeTasks: [] as TaskInfo[],
  universeStocks: [] as UniverseStockItem[],
  universeSource: null as 'tushare' | 'fallback_file' | 'none' | null,
  isLoadingUniverseStocks: false,
  selectedUniverseStockCodes: [] as string[],
  markdownDrawerOpen: false,
  canAnalyzeRecommendation: true,
  canAnalyzeBatch: true,
};

function buildHistoryParams(page: number, historyWindowDays: HistoryWindowDays, batchId: HistoryBatchId) {
  return {
    batchId: batchId || undefined,
    startDate: historyWindowDays == null ? undefined : getRecentStartDate(historyWindowDays),
    endDate: getTodayInShanghai(),
    page,
    limit: PAGE_SIZE,
  };
}

function parseHistoryCreatedAt(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function sortHistoryByCreatedAtDesc(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort((a, b) => {
    const timeDiff = parseHistoryCreatedAt(b.createdAt) - parseHistoryCreatedAt(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return (b.id ?? 0) - (a.id ?? 0);
  });
}

async function fetchHistory(
  get: () => StockPoolState,
  set: (partial: Partial<StockPoolState>) => void,
  options: FetchHistoryOptions = {},
): Promise<HistoryListResponse | null> {
  const { autoSelectFirst = false, reset = true, silent = false } = options;
  const currentState = get();
  const page = reset ? 1 : currentState.currentPage + 1;
  const requestId = ++historyRequestSeq;

  if (!silent) {
    set(
      reset
          ? { isLoadingHistory: true, isLoadingMore: false, currentPage: 1, hasMore: true }
        : { isLoadingMore: true },
    );
  }

  try {
    const response = await historyApi.getList(
      buildHistoryParams(page, currentState.historyWindowDays, currentState.currentBatchId)
    );
    if (requestId !== historyRequestSeq) {
      return null;
    }

    if (silent && reset) {
      const existingIds = new Set(get().historyItems.map((item) => item.id));
      const newItems = response.items.filter((item) => !existingIds.has(item.id));
      if (newItems.length > 0) {
        set({ historyItems: sortHistoryByCreatedAtDesc([...newItems, ...get().historyItems]) });
      }
      set({ historyTotal: response.total });
    } else if (reset) {
      set({
        historyItems: sortHistoryByCreatedAtDesc(response.items),
        currentPage: 1,
        historyTotal: response.total,
      });
    } else {
      set({
        historyItems: sortHistoryByCreatedAtDesc([...get().historyItems, ...response.items]),
        currentPage: page,
        historyTotal: response.total,
      });
    }

    if (!silent) {
      const totalLoaded = reset ? response.items.length : get().historyItems.length;
      set({ hasMore: totalLoaded < response.total });
    }

    const visibleIds = new Set(get().historyItems.map((item) => item.id));
    set({
      selectedHistoryIds: get().selectedHistoryIds.filter((id) => visibleIds.has(id)),
    });

    if (autoSelectFirst && response.items.length > 0 && !get().selectedReport) {
      await get().selectHistoryItem(response.items[0].id);
    }

    return response;
  } catch (error) {
    if (requestId !== historyRequestSeq) {
      return null;
    }
    set({ error: getParsedApiError(error) });
    return null;
  } finally {
    if (requestId === historyRequestSeq) {
      set({
        isLoadingHistory: false,
        isLoadingMore: false,
      });
    }
  }
}

export const useStockPoolStore = create<StockPoolState>((set, get) => ({
  ...initialState,

  setQuery: (query) => {
    set({
      query,
      selectionSource: 'manual',
      inputError: undefined,
      duplicateError: null,
      submitFeedback: null,
    });
  },

  clearError: () => set({ error: null }),

  clearInlineMessages: () => set({ inputError: undefined, duplicateError: null, submitFeedback: null }),

  setNotify: (notify) => set({ notify }),

  openMarkdownDrawer: () => set({ markdownDrawerOpen: true }),

  closeMarkdownDrawer: () => set({ markdownDrawerOpen: false }),

  setAnalysisCapabilities: ({ canAnalyzeRecommendation, canAnalyzeBatch }) =>
    set({ canAnalyzeRecommendation, canAnalyzeBatch }),

  loadInitialHistory: async () => {
    await fetchHistory(get, set, { autoSelectFirst: true, reset: true });
  },

  refreshHistory: async (silent = false) => {
    await fetchHistory(get, set, { reset: true, silent });
  },

  loadMoreHistory: async () => {
    const state = get();
    if (state.isLoadingMore || !state.hasMore) {
      return;
    }
    await fetchHistory(get, set, { reset: false });
  },

  loadAllHistory: async () => {
    const state = get();
    if (state.isLoadingAllHistory || state.isLoadingMore || !state.hasMore) {
      return;
    }
    set({ isLoadingAllHistory: true });
    try {
      let guard = 0;
      while (get().hasMore && !get().isLoadingMore && guard < 1000) {
        // eslint-disable-next-line no-await-in-loop
        await fetchHistory(get, set, { reset: false });
        guard += 1;
      }
    } finally {
      set({ isLoadingAllHistory: false });
    }
  },

  setHistoryWindowDays: async (days) => {
    if (get().historyWindowDays === days) {
      return;
    }
    set({ historyWindowDays: days, selectedHistoryIds: [] });
    await fetchHistory(get, set, { reset: true });
  },

  setCurrentBatchId: async (batchId) => {
    if (get().currentBatchId === batchId) {
      return;
    }
    set({ currentBatchId: batchId, selectedHistoryIds: [] });
    await fetchHistory(get, set, { reset: true });
  },

  selectHistoryItem: async (recordId) => {
    const requestId = ++reportRequestSeq;
    const shouldShowInitialLoading = !get().selectedReport;

    if (shouldShowInitialLoading) {
      set({ isLoadingReport: true });
    }

    try {
      const report = await historyApi.getDetail(recordId);
      if (requestId !== reportRequestSeq) {
        return;
      }

      set({
        selectedReport: report,
        error: null,
        isLoadingReport: false,
      });
    } catch (error) {
      if (requestId !== reportRequestSeq) {
        return;
      }

      set({
        error: getParsedApiError(error),
        isLoadingReport: false,
      });
    }
  },

  toggleHistorySelection: (recordId) => {
    const selected = new Set(get().selectedHistoryIds);
    if (selected.has(recordId)) {
      selected.delete(recordId);
    } else {
      selected.add(recordId);
    }

    set({ selectedHistoryIds: Array.from(selected) });
  },

  toggleSelectAllVisible: () => {
    const visibleIds = get().historyItems.map((item) => item.id);
    const selectedIds = get().selectedHistoryIds;
    const visibleSet = new Set(visibleIds);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    set({
      selectedHistoryIds: allSelected
        ? selectedIds.filter((id) => !visibleSet.has(id))
        : Array.from(new Set([...selectedIds, ...visibleIds])),
    });
  },

  deleteSelectedHistory: async () => {
    const state = get();
    const recordIds = Array.from(new Set(state.selectedHistoryIds));
    if (recordIds.length === 0 || state.isDeletingHistory) {
      return;
    }

    set({ isDeletingHistory: true });
    try {
      await historyApi.deleteRecords(recordIds);

      const deletedIds = new Set(recordIds);
      const selectedWasDeleted = state.selectedReport?.meta.id !== undefined
        && deletedIds.has(state.selectedReport.meta.id);

      set({ selectedHistoryIds: [] });

      const freshPage = await fetchHistory(get, set, { reset: true });

      if (selectedWasDeleted) {
        const nextItem = freshPage?.items?.[0];
        if (nextItem) {
          await get().selectHistoryItem(nextItem.id);
        } else {
          set({ selectedReport: null });
        }
      }
    } catch (error) {
      set({ error: getParsedApiError(error) });
    } finally {
      set({ isDeletingHistory: false });
    }
  },

  submitAnalysis: async (options) => {
    const state = get();
    const rawStockCode = options?.stockCode ?? state.query;
    const stockCodeInput = rawStockCode.trim();
    const stockName = options?.stockName;
    const selectionSource = options?.selectionSource ?? state.selectionSource;
    const originalQuery = (options?.originalQuery ?? state.query).trim();
    const notify = options?.notify ?? state.notify;
    const originalQueryLower = originalQuery.toLowerCase();
    const forceRefresh = options?.forceRefresh ?? false;

    if (originalQueryLower.startsWith('recommendation:') && !state.canAnalyzeRecommendation) {
      set({
        submitFeedback: null,
        inputError: undefined,
        duplicateError: null,
        error: getParsedApiError('当前账号仅支持查看筛股结果，无法提交筛股分析'),
      });
      return null;
    }

    if (!stockCodeInput) {
      set({ inputError: '请输入股票代码', duplicateError: null });
      return null;
    }

    if (selectionSource !== 'autocomplete' && isObviouslyInvalidStockQuery(stockCodeInput)) {
      set({ inputError: '请输入有效的股票代码或股票名称', duplicateError: null });
      return null;
    }

    let normalizedStockCode = stockCodeInput;
    if (selectionSource === 'autocomplete' || looksLikeStockCode(stockCodeInput)) {
      const { valid, message, normalized } = validateStockCode(stockCodeInput);
      if (!valid) {
        set({ inputError: message, duplicateError: null });
        return null;
      }
      normalizedStockCode = normalized;
    }

    set({
      inputError: undefined,
      duplicateError: null,
      submitFeedback: null,
      error: null,
      isAnalyzing: true,
    });

    const requestId = ++analyzeRequestSeq;
    try {
      const response = await analysisApi.analyzeAsync({
        stockCode: normalizedStockCode,
        reportType: 'detailed',
        stockName,
        originalQuery: originalQuery || stockCodeInput,
        selectionSource,
        notify,
        forceRefresh,
      });

      if (requestId !== analyzeRequestSeq) {
        return null;
      }

      const batchId = 'batchId' in response && typeof response.batchId === 'string'
        ? response.batchId
        : null;

      set({
        query: '',
        selectionSource: 'manual',
        currentBatchId: batchId || get().currentBatchId,
      });
      return batchId;
    } catch (error) {
      if (requestId !== analyzeRequestSeq) {
        return null;
      }

      if (error instanceof DuplicateTaskError) {
        set({
          duplicateError: `股票 ${error.stockCode} 正在分析中，请等待完成`,
        });
        return null;
      }

      set({ error: getParsedApiError(error) });
      return null;
    } finally {
      if (requestId === analyzeRequestSeq) {
        set({ isAnalyzing: false });
      }
    }
  },

  submitAllAShareAnalysis: async (): Promise<void> => {
    if (!get().canAnalyzeBatch || !get().canAnalyzeRecommendation) {
      set({
        error: getParsedApiError('当前账号无权限提交全市场批量分析'),
      });
      return;
    }
    if (get().isAnalyzing) {
      return;
    }

    const requestId = ++analyzeRequestSeq;
    set({
      inputError: undefined,
      duplicateError: null,
      submitFeedback: null,
      error: null,
      isAnalyzing: true,
    });

    try {
      const response = await analysisApi.analyzeUniverse({
        universe: 'a_share',
        notify: get().notify,
      });
      if (requestId !== analyzeRequestSeq) {
        return;
      }
      set({ submitFeedback: response.message });
    } catch (error) {
      if (requestId !== analyzeRequestSeq) {
        return;
      }
      set({ error: getParsedApiError(error) });
    } finally {
      if (requestId === analyzeRequestSeq) {
        set({ isAnalyzing: false });
      }
    }
  },

  loadUniverseStocks: async () => {
    if (get().isLoadingUniverseStocks) {
      return;
    }
    set({ isLoadingUniverseStocks: true, error: null });
    try {
      const response = await analysisApi.getUniverseStocks();
      const stocks = response.items ?? [];
      const validCodeSet = new Set(stocks.map((item) => item.stockCode));
      set({
        universeStocks: stocks,
        universeSource: response.source,
        selectedUniverseStockCodes: get().selectedUniverseStockCodes.filter((code) => validCodeSet.has(code)),
      });
    } catch (error) {
      set({ error: getParsedApiError(error) });
    } finally {
      set({ isLoadingUniverseStocks: false });
    }
  },

  toggleUniverseStockSelection: (stockCode) => {
    const selected = new Set(get().selectedUniverseStockCodes);
    if (selected.has(stockCode)) {
      selected.delete(stockCode);
    } else {
      selected.add(stockCode);
    }
    set({ selectedUniverseStockCodes: Array.from(selected) });
  },

  toggleSelectAllUniverseStocks: (stockCodes) => {
    const selected = new Set(get().selectedUniverseStockCodes);
    const allSelected = stockCodes.length > 0 && stockCodes.every((code) => selected.has(code));
    if (allSelected) {
      for (const code of stockCodes) {
        selected.delete(code);
      }
    } else {
      for (const code of stockCodes) {
        selected.add(code);
      }
    }
    set({ selectedUniverseStockCodes: Array.from(selected) });
  },

  clearUniverseStockSelection: () => {
    set({ selectedUniverseStockCodes: [] });
  },

  submitSelectedUniverseAnalysis: async (stockCodes): Promise<string | null> => {
    if (!get().canAnalyzeBatch || !get().canAnalyzeRecommendation) {
      set({
        error: getParsedApiError('当前账号无权限提交筛股批量分析'),
      });
      return null;
    }
    const selectedCodes = Array.from(new Set(stockCodes ?? get().selectedUniverseStockCodes));
    if (selectedCodes.length === 0 || get().isAnalyzing) {
      return null;
    }
    set({
      inputError: undefined,
      duplicateError: null,
      submitFeedback: null,
      error: null,
      isAnalyzing: true,
    });
    const requestId = ++analyzeRequestSeq;
    try {
      const response = await analysisApi.analyzeAsync({
        stockCodes: selectedCodes,
        reportType: 'detailed',
        originalQuery: 'universe:a_share:selected',
        selectionSource: 'import',
        notify: get().notify,
      });
      if (requestId !== analyzeRequestSeq) {
        return null;
      }
      if ('accepted' in response && 'duplicates' in response) {
        const batchId = response.batchId || null;
        set({
          submitFeedback: `已提交 ${response.accepted.length} 只，重复跳过 ${response.duplicates.length} 只`,
          selectedUniverseStockCodes: [],
          currentBatchId: batchId || get().currentBatchId,
        });
        return batchId;
      } else {
        const batchId = response.batchId || null;
        set({
          submitFeedback: selectedCodes.length === 1
            ? `已提交 ${selectedCodes[0]} 分析任务`
            : `已提交 ${selectedCodes.length} 只股票分析任务`,
          selectedUniverseStockCodes: [],
          currentBatchId: batchId || get().currentBatchId,
        });
        return batchId;
      }
    } catch (error) {
      if (requestId !== analyzeRequestSeq) {
        return null;
      }
      if (error instanceof DuplicateTaskError) {
        set({
          duplicateError: `股票 ${error.stockCode} 正在分析中，请等待完成`,
        });
        return null;
      }
      set({ error: getParsedApiError(error) });
      return null;
    } finally {
      if (requestId === analyzeRequestSeq) {
        set({ isAnalyzing: false });
      }
    }
    return null;
  },

  syncTaskCreated: (task) => {
    if (dismissedTaskIds.has(task.taskId)) {
      return;
    }
    if (get().activeTasks.some((item) => item.taskId === task.taskId)) {
      return;
    }
    set({ activeTasks: [...get().activeTasks, task] });
  },

  syncTaskUpdated: (task) => {
    if (dismissedTaskIds.has(task.taskId)) {
      return;
    }
    const nextTasks = [...get().activeTasks];
    const index = nextTasks.findIndex((item) => item.taskId === task.taskId);
    if (index >= 0) {
      nextTasks[index] = task;
      set({ activeTasks: nextTasks });
    }
  },

  syncTaskFailed: (task) => {
    get().syncTaskUpdated(task);
    set({ error: getParsedApiError(task.error || '分析失败') });
  },

  removeTask: (taskId) => {
    dismissedTaskIds.add(taskId);
    set({ activeTasks: get().activeTasks.filter((task) => task.taskId !== taskId) });
  },

  resetDashboardState: () => {
    historyRequestSeq += 1;
    reportRequestSeq = 0;
    analyzeRequestSeq = 0;
    dismissedTaskIds.clear();
    set({ ...initialState });
  },
}));
