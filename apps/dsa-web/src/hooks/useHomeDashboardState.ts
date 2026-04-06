import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStockPoolStore } from '../stores';

/**
 * Keep HomePage focused on local UI state while the store owns dashboard business state.
 * This preserves the current visual contract and only centralizes state selection.
 */
export function useHomeDashboardState() {
  const dashboardState = useStockPoolStore(
    useShallow((state) => ({
      query: state.query,
      inputError: state.inputError,
      duplicateError: state.duplicateError,
      submitFeedback: state.submitFeedback,
      error: state.error,
      isAnalyzing: state.isAnalyzing,
      historyItems: state.historyItems,
      selectedHistoryIds: state.selectedHistoryIds,
      isDeletingHistory: state.isDeletingHistory,
      isLoadingHistory: state.isLoadingHistory,
      isLoadingMore: state.isLoadingMore,
      hasMore: state.hasMore,
      selectedReport: state.selectedReport,
      isLoadingReport: state.isLoadingReport,
      activeTasks: state.activeTasks,
      universeStocks: state.universeStocks,
      universeSource: state.universeSource,
      isLoadingUniverseStocks: state.isLoadingUniverseStocks,
      selectedUniverseStockCodes: state.selectedUniverseStockCodes,
      markdownDrawerOpen: state.markdownDrawerOpen,
      notify: state.notify,
      setQuery: state.setQuery,
      setNotify: state.setNotify,
      clearError: state.clearError,
      loadInitialHistory: state.loadInitialHistory,
      refreshHistory: state.refreshHistory,
      loadMoreHistory: state.loadMoreHistory,
      selectHistoryItem: state.selectHistoryItem,
      toggleHistorySelection: state.toggleHistorySelection,
      toggleSelectAllVisible: state.toggleSelectAllVisible,
      deleteSelectedHistory: state.deleteSelectedHistory,
      submitAnalysis: state.submitAnalysis,
      submitAllAShareAnalysis: state.submitAllAShareAnalysis,
      loadUniverseStocks: state.loadUniverseStocks,
      toggleUniverseStockSelection: state.toggleUniverseStockSelection,
      toggleSelectAllUniverseStocks: state.toggleSelectAllUniverseStocks,
      clearUniverseStockSelection: state.clearUniverseStockSelection,
      submitSelectedUniverseAnalysis: state.submitSelectedUniverseAnalysis,
      syncTaskCreated: state.syncTaskCreated,
      syncTaskUpdated: state.syncTaskUpdated,
      syncTaskFailed: state.syncTaskFailed,
      removeTask: state.removeTask,
      openMarkdownDrawer: state.openMarkdownDrawer,
      closeMarkdownDrawer: state.closeMarkdownDrawer,
    })),
  );

  const selectedIds = useMemo(
    () => new Set(dashboardState.selectedHistoryIds),
    [dashboardState.selectedHistoryIds],
  );

  return {
    ...dashboardState,
    selectedIds,
  };
}

export default useHomeDashboardState;
