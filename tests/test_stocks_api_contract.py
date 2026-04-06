# -*- coding: utf-8 -*-
"""Contract tests for stocks API endpoint payloads."""

import unittest
from unittest.mock import patch

from tests.litellm_stub import ensure_litellm_stub

ensure_litellm_stub()

try:
    from api.v1.endpoints.stocks import get_stock_company_insights, get_stock_quote
except Exception:  # pragma: no cover - optional dependency environments
    get_stock_company_insights = None
    get_stock_quote = None

from src.services.stock_service import StockService


class StocksApiContractTestCase(unittest.TestCase):
    def test_quote_contains_valuation_fields_when_available(self) -> None:
        if get_stock_quote is None:
            self.skipTest("stocks endpoint unavailable in this environment")

        with patch("api.v1.endpoints.stocks.StockService") as service_cls:
            service_cls.return_value.get_realtime_quote.return_value = {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "current_price": 1800.0,
                "pe_ratio": 18.2,
                "pb_ratio": 3.8,
                "total_mv": 2250000000000,
                "circ_mv": 2240000000000,
            }
            resp = get_stock_quote("600519")

        self.assertEqual(resp.stock_code, "600519")
        self.assertEqual(resp.pe_ratio, 18.2)
        self.assertEqual(resp.pb_ratio, 3.8)
        self.assertEqual(resp.total_mv, 2250000000000)
        self.assertEqual(resp.circ_mv, 2240000000000)

    def test_company_insights_returns_profile_and_metrics(self) -> None:
        if get_stock_company_insights is None:
            self.skipTest("stocks endpoint unavailable in this environment")

        with patch("api.v1.endpoints.stocks.StockService") as service_cls:
            service_cls.return_value.get_company_insights.return_value = {
                "stock_code": "600519",
                "profile": {
                    "stock_code": "600519",
                    "stock_name": "贵州茅台",
                    "company_name": "贵州茅台",
                    "company_intro": "示例介绍",
                    "main_business": "示例主营",
                    "business_scope": "示例业务范围",
                    "industry": "白酒",
                    "area": "贵州",
                    "market": "主板",
                    "list_date": "20010827",
                    "act_name": "贵州省人民政府国有资产监督管理委员会",
                    "act_ent_type": "地方国企",
                    "source_chain": ["basic_info_fallback"],
                },
                "financial_metrics": {
                    "stock_code": "600519",
                    "as_of": "2026-04-05",
                    "pe_ratio": 18.2,
                    "pb_ratio": 3.8,
                    "ps_ratio": None,
                    "peg_ratio": None,
                    "dividend_yield": 2.1,
                    "total_mv": 2250000000000,
                    "circ_mv": 2240000000000,
                    "roe": 23.4,
                    "roa": None,
                    "gross_margin": 91.1,
                    "net_margin": None,
                    "debt_ratio": None,
                    "revenue": 150000000000,
                    "net_profit_parent": 78000000000,
                    "operating_cash_flow": 86000000000,
                    "revenue_yoy": 11.2,
                    "net_profit_yoy": 10.4,
                    "source_chain": ["realtime_quote", "fundamental_context"],
                },
            }
            resp = get_stock_company_insights("600519")

        self.assertEqual(resp.stock_code, "600519")
        self.assertEqual(resp.profile.main_business, "示例主营")
        self.assertEqual(resp.financial_metrics.pe_ratio, 18.2)
        self.assertEqual(resp.financial_metrics.roe, 23.4)

    def test_stock_service_maps_dividend_from_earnings_dividend_block(self) -> None:
        service = StockService()

        with patch.object(service, "_load_basic_info_map", return_value={}), \
             patch.object(service, "get_realtime_quote", return_value={}), \
             patch("data_provider.base.DataFetcherManager") as manager_cls:
            manager = manager_cls.return_value
            manager.get_stock_name.return_value = "Apple Inc."
            manager.get_fundamental_context.return_value = {
                "valuation": {"data": {}},
                "growth": {"data": {}},
                "earnings": {
                    "data": {
                        "financial_report": {"report_date": "2025-12-31"},
                        "dividend": {"ttm_dividend_yield_pct": 1.8},
                    }
                },
                "source_chain": ["fundamental_context"],
            }

            payload = service.get_company_insights("AAPL")

        self.assertEqual(payload["stock_code"], "AAPL")
        self.assertEqual(payload["financial_metrics"]["as_of"], "2025-12-31")
        self.assertEqual(payload["financial_metrics"]["dividend_yield"], 1.8)

    def test_stock_service_fills_foreign_metrics_from_yfinance_fallback(self) -> None:
        service = StockService()

        with patch.object(service, "_load_basic_info_map", return_value={}), \
             patch.object(service, "get_realtime_quote", return_value={}), \
             patch.object(
                 service,
                 "_load_yfinance_insights",
                 return_value={
                     "profile": {
                         "stock_name": "Apple Inc.",
                         "company_name": "Apple Inc.",
                         "company_intro": "Apple designs consumer electronics.",
                         "industry": "Consumer Electronics",
                         "area": "US",
                         "market": "NASDAQ",
                     },
                     "financial_metrics": {
                         "pe_ratio": 29.6,
                         "pb_ratio": 42.0,
                         "ps_ratio": 7.5,
                         "peg_ratio": 2.1,
                         "roe": 150.0,
                         "revenue_yoy": 6.2,
                     },
                     "source": "yfinance_info",
                 },
             ), \
             patch("data_provider.base.DataFetcherManager") as manager_cls:
            manager = manager_cls.return_value
            manager.get_stock_name.return_value = "AAPL"
            manager.get_fundamental_context.return_value = {
                "valuation": {"data": {}},
                "growth": {"data": {}},
                "earnings": {"data": {}},
                "source_chain": [],
            }

            payload = service.get_company_insights("AAPL")

        self.assertEqual(payload["profile"]["company_name"], "Apple Inc.")
        self.assertEqual(payload["financial_metrics"]["pe_ratio"], 29.6)
        self.assertEqual(payload["financial_metrics"]["ps_ratio"], 7.5)
        self.assertEqual(payload["financial_metrics"]["revenue_yoy"], 6.2)
        self.assertIn("yfinance_info", payload["financial_metrics"]["source_chain"])


if __name__ == "__main__":
    unittest.main()
