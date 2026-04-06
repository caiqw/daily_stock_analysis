import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisApi } from '../../api/analysis';
import { stocksApi } from '../../api/stocks';
import { useStockPoolStore } from '../../stores';
import RecommendationPage from '../RecommendationPage';

const { authCaps } = vi.hoisted(() => ({
  authCaps: {
    canAnalyzeRecommendation: true,
    canAnalyzeBatch: true,
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    capabilities: authCaps,
  }),
}));

vi.mock('../../api/analysis', async () => {
  const actual = await vi.importActual<typeof import('../../api/analysis')>('../../api/analysis');
  return {
    ...actual,
    analysisApi: {
      analyzeAsync: vi.fn(),
      getUniverseStocks: vi.fn(),
    },
  };
});

vi.mock('../../hooks', async () => {
  const actual = await vi.importActual<typeof import('../../hooks')>('../../hooks');
  return {
    ...actual,
    useDashboardLifecycle: vi.fn(),
  };
});

vi.mock('../../api/stocks', () => ({
  stocksApi: {
    getInsights: vi.fn().mockResolvedValue({
      stockCode: '600519',
      profile: {
        stockCode: '600519',
        stockName: '贵州茅台',
        companyName: '贵州茅台',
        companyIntro: '公司介绍',
        mainBusiness: '主营业务',
        businessScope: '业务范围',
      },
      financialMetrics: {
        stockCode: '600519',
        peRatio: 18.2,
        pbRatio: 3.8,
      },
    }),
  },
}));

describe('RecommendationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCaps.canAnalyzeRecommendation = true;
    authCaps.canAnalyzeBatch = true;
    vi.mocked(stocksApi.getInsights).mockResolvedValue({
      stockCode: '600519',
      profile: {
        stockCode: '600519',
        stockName: '贵州茅台',
        companyName: '贵州茅台',
        companyIntro: '公司介绍',
        mainBusiness: '主营业务',
        businessScope: '业务范围',
      },
      financialMetrics: {
        stockCode: '600519',
        peRatio: 18.2,
        pbRatio: 3.8,
      },
    });
    useStockPoolStore.getState().resetDashboardState();
  });

  it('loads universe list and shows basic stock fields', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 2,
      items: [
        {
          stockCode: '600519',
          stockName: '贵州茅台',
          industry: '白酒',
          area: '贵州',
          market: '主板',
          actName: '贵州省国资委',
        },
        {
          stockCode: '000001',
          stockName: '平安银行',
          industry: '银行',
          area: '深圳',
          market: '主板',
          actName: '中国平安',
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('筛股')).toBeInTheDocument();
    expect(screen.getByText('贵州茅台')).toBeInTheDocument();
    expect(screen.getByText('平安银行')).toBeInTheDocument();
    expect(screen.getByText('行业: 白酒')).toBeInTheDocument();
    expect(screen.getByText('地域: 贵州')).toBeInTheDocument();
    expect(screen.getByText('市场: 主板')).toBeInTheDocument();
    expect(screen.getByText('实控人: 贵州省国资委')).toBeInTheDocument();
  });

  it('supports select all and clear', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 1,
      items: [{ stockCode: '600519', stockName: '贵州茅台' }],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('贵州茅台');
    fireEvent.click(screen.getByLabelText('全选当前筛选结果'));
    expect(screen.getByRole('button', { name: '分析已勾选 (1)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清空勾选' }));
    expect(screen.getByRole('button', { name: '分析已勾选 (0)' })).toBeDisabled();
  });

  it('switches to results section after batch submit', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 1,
      items: [{ stockCode: '600519', stockName: '贵州茅台' }],
    });
    vi.mocked(analysisApi.analyzeAsync).mockResolvedValue({
      accepted: [{ taskId: 'task-1', stockCode: '600519', status: 'pending' }],
      duplicates: [],
      message: 'ok',
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('贵州茅台');
    fireEvent.click(screen.getByLabelText('全选当前筛选结果'));
    fireEvent.click(screen.getByRole('button', { name: '分析已勾选 (1)' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '分析结果' })).toHaveClass('bg-primary/15');
    });
    expect(screen.getByText('暂无结果，先在“股票池”里提交分析任务。')).toBeInTheDocument();
  });

  it('shows read-only hint and disables submit buttons for viewer role', async () => {
    authCaps.canAnalyzeRecommendation = false;
    authCaps.canAnalyzeBatch = false;
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 1,
      items: [{ stockCode: '600519', stockName: '贵州茅台' }],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('当前账号为只读模式');
    expect(screen.getByRole('button', { name: '分析输入股票' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '分析已勾选 (0)' })).toBeDisabled();
  });

  it('renders selected report summary in results pane', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 0,
      items: [],
    });

    useStockPoolStore.setState({
      historyItems: [
        {
          id: 7,
          queryId: 'q-7',
          stockCode: '600519',
          stockName: '贵州茅台',
          sentimentScore: 79,
          signalScore: 66,
          createdAt: '2026-04-05T10:00:00Z',
        },
      ],
      selectedReport: {
        meta: {
          id: 7,
          queryId: 'q-7',
          stockCode: '600519',
          stockName: '贵州茅台',
          reportType: 'detailed',
          reportLanguage: 'zh',
          createdAt: '2026-04-05T10:00:00Z',
        },
        summary: {
          analysisSummary: '趋势维持强势',
          operationAdvice: '继续观察买点',
          trendPrediction: '短线震荡偏强',
          sentimentScore: 79,
        },
      },
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '分析结果' }));
    expect(await screen.findByText('趋势维持强势')).toBeInTheDocument();
  });

  it('supports quick filter for analyzed stocks in pool', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 2,
      items: [
        { stockCode: '600519', stockName: '贵州茅台' },
        { stockCode: '000001', stockName: '平安银行' },
      ],
    });
    useStockPoolStore.setState({
      historyItems: [
        {
          id: 101,
          queryId: 'q-101',
          stockCode: '600519',
          stockName: '贵州茅台',
          createdAt: '2026-04-05T10:00:00Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('贵州茅台');
    expect(screen.getByText('平安银行')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '仅已分析' }));
    await waitFor(() => {
      expect(screen.queryByText('平安银行')).not.toBeInTheDocument();
    });
    expect(screen.getByText('贵州茅台')).toBeInTheDocument();
  });

  it('shows full report entry in pool list', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 1,
      items: [{ stockCode: '600519', stockName: '贵州茅台' }],
    });
    useStockPoolStore.setState({
      historyItems: [
        {
          id: 401,
          queryId: 'q-401',
          stockCode: '600519',
          stockName: '贵州茅台',
          operationAdvice: '买入',
          trendPrediction: '震荡上行',
          createdAt: '2026-04-05T10:00:00Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('贵州茅台');
    expect(screen.getByRole('button', { name: '完整分析报告' })).toBeInTheDocument();
  });

  it('opens pool result preview dialog without switching section', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 1,
      items: [{ stockCode: '600519', stockName: '贵州茅台' }],
    });
    const selectHistoryItemMock = vi.fn().mockResolvedValue(undefined);
    useStockPoolStore.setState({
      historyItems: [
        {
          id: 301,
          queryId: 'q-301',
          stockCode: '600519',
          stockName: '贵州茅台',
          createdAt: '2026-04-05T10:00:00Z',
        },
      ],
      selectedReport: {
        meta: {
          id: 301,
          queryId: 'q-301',
          stockCode: '600519',
          stockName: '贵州茅台',
          reportType: 'detailed',
          reportLanguage: 'zh',
          createdAt: '2026-04-05T10:00:00Z',
        },
        summary: {
          analysisSummary: '趋势维持强势',
          operationAdvice: '继续观察买点',
          trendPrediction: '短线震荡偏强',
          sentimentScore: 79,
        },
      },
      selectHistoryItem: selectHistoryItemMock,
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('贵州茅台');
    fireEvent.click(screen.getByRole('button', { name: '查看分析结果' }));

    expect(screen.getByRole('button', { name: '股票池' })).toHaveClass('bg-primary/15');
    expect(await screen.findByRole('button', { name: '查看完整分析报告' })).toBeInTheDocument();
    expect(screen.getByText('趋势维持强势')).toBeInTheDocument();
  });

  it('filters results by current submitted batch', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 2,
      items: [
        { stockCode: '600519', stockName: '贵州茅台' },
        { stockCode: '000001', stockName: '平安银行' },
      ],
    });
    vi.mocked(analysisApi.analyzeAsync).mockResolvedValue({
      accepted: [{ taskId: 'task-1', stockCode: '600519', status: 'pending' }],
      duplicates: [],
      message: 'ok',
    });
    useStockPoolStore.setState({
      historyItems: [
        {
          id: 201,
          queryId: 'q-201',
          stockCode: '600519',
          stockName: '贵州茅台',
          createdAt: '2026-04-05T10:00:00Z',
        },
        {
          id: 202,
          queryId: 'q-202',
          stockCode: '000001',
          stockName: '平安银行',
          createdAt: '2026-04-05T09:00:00Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    await screen.findByText('贵州茅台');
    fireEvent.click(screen.getAllByRole('checkbox')[1]); // 仅勾选第一只（600519）
    fireEvent.click(screen.getByRole('button', { name: '分析已勾选 (1)' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '仅本次提交' })).toHaveClass('bg-primary/15');
    });
    expect(screen.getByText('贵州茅台')).toBeInTheDocument();
    expect(screen.queryByText('平安银行')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部批次' }));
    expect(await screen.findByText('平安银行')).toBeInTheDocument();
  });

  it('tracks single-input submit into current batch results', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 0,
      items: [],
    });
    vi.mocked(analysisApi.analyzeAsync).mockResolvedValue({
      accepted: [{ taskId: 'task-single-1', stockCode: '000002.SZ', status: 'pending' }],
      duplicates: [],
      message: 'ok',
    });
    useStockPoolStore.setState({
      historyItems: [
        {
          id: 301,
          queryId: 'q-301',
          stockCode: '000002',
          stockName: '万 科Ａ',
          createdAt: '2026-04-06T12:06:16Z',
        },
        {
          id: 302,
          queryId: 'q-302',
          stockCode: '000001',
          stockName: '平安银行',
          createdAt: '2026-04-06T12:01:16Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    fireEvent.change(
      screen.getByPlaceholderText('输入单只股票代码后可直接分析，如 600519、000001'),
      { target: { value: '000002' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '分析输入股票' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '分析结果' })).toHaveClass('bg-primary/15');
      expect(screen.getByRole('button', { name: '仅本次提交' })).toHaveClass('bg-primary/15');
    });
    expect(screen.getByText('万 科Ａ')).toBeInTheDocument();
    expect(screen.queryByText('平安银行')).not.toBeInTheDocument();
  });

  it('filters recommendation results by keyword', async () => {
    vi.mocked(analysisApi.getUniverseStocks).mockResolvedValue({
      universe: 'a_share',
      source: 'tushare',
      totalSymbols: 0,
      items: [],
    });
    useStockPoolStore.setState({
      historyItems: [
        {
          id: 401,
          queryId: 'q-401',
          stockCode: '000002',
          stockName: '万 科Ａ',
          createdAt: '2026-04-06T12:06:16Z',
        },
        {
          id: 402,
          queryId: 'q-402',
          stockCode: '000001',
          stockName: '平安银行',
          createdAt: '2026-04-06T12:01:16Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecommendationPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '分析结果' }));
    expect(await screen.findByText('万 科Ａ')).toBeInTheDocument();
    expect(screen.getByText('平安银行')).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('按代码/名称/建议搜索结果，如 000002、万科'),
      { target: { value: '000002' } },
    );
    await waitFor(() => {
      expect(screen.getByText('万 科Ａ')).toBeInTheDocument();
      expect(screen.queryByText('平安银行')).not.toBeInTheDocument();
    });
  });
});
