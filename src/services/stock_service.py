# -*- coding: utf-8 -*-
"""
===================================
股票数据服务层
===================================

职责：
1. 封装股票数据获取逻辑
2. 提供实时行情和历史数据接口
"""

import logging
import csv
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List

import pandas as pd

from src.repositories.stock_repo import StockRepository
from src.config import get_config

logger = logging.getLogger(__name__)


class StockService:
    """
    股票数据服务
    
    封装股票数据获取的业务逻辑
    """
    
    def __init__(self):
        """初始化股票数据服务"""
        self.repo = StockRepository()
    
    def get_realtime_quote(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取股票实时行情
        
        Args:
            stock_code: 股票代码
            
        Returns:
            实时行情数据字典
        """
        try:
            # 调用数据获取器获取实时行情
            from data_provider.base import DataFetcherManager
            
            manager = DataFetcherManager()
            quote = manager.get_realtime_quote(stock_code)
            
            if quote is None:
                logger.warning(f"获取 {stock_code} 实时行情失败")
                return None
            
            # UnifiedRealtimeQuote 是 dataclass，使用 getattr 安全访问字段
            # 字段映射: UnifiedRealtimeQuote -> API 响应
            # - code -> stock_code
            # - name -> stock_name
            # - price -> current_price
            # - change_amount -> change
            # - change_pct -> change_percent
            # - open_price -> open
            # - high -> high
            # - low -> low
            # - pre_close -> prev_close
            # - volume -> volume
            # - amount -> amount
            return {
                "stock_code": getattr(quote, "code", stock_code),
                "stock_name": getattr(quote, "name", None),
                "current_price": getattr(quote, "price", 0.0) or 0.0,
                "change": getattr(quote, "change_amount", None),
                "change_percent": getattr(quote, "change_pct", None),
                "open": getattr(quote, "open_price", None),
                "high": getattr(quote, "high", None),
                "low": getattr(quote, "low", None),
                "prev_close": getattr(quote, "pre_close", None),
                "volume": getattr(quote, "volume", None),
                "amount": getattr(quote, "amount", None),
                "pe_ratio": getattr(quote, "pe_ratio", None),
                "pb_ratio": getattr(quote, "pb_ratio", None),
                "total_mv": getattr(quote, "total_mv", None),
                "circ_mv": getattr(quote, "circ_mv", None),
                "update_time": datetime.now().isoformat(),
            }
            
        except ImportError:
            logger.warning("DataFetcherManager 未找到，使用占位数据")
            return self._get_placeholder_quote(stock_code)
        except Exception as e:
            logger.error(f"获取实时行情失败: {e}", exc_info=True)
            return None

    @staticmethod
    def _extract_base_code(raw_value: Optional[str]) -> str:
        text = (raw_value or "").strip()
        if not text:
            return ""
        if "." in text:
            text = text.split(".", 1)[0].strip()
        return text.upper()

    def _load_basic_info_map(self) -> Dict[str, Dict[str, str]]:
        cfg = get_config()
        project_root = Path(__file__).resolve().parents[2]
        merged: Dict[str, Dict[str, str]] = {}

        def _parse_csv(path: Path) -> Dict[str, Dict[str, str]]:
            parsed: Dict[str, Dict[str, str]] = {}
            if not path.exists():
                return parsed
            with path.open("r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    ts_code = (row.get("ts_code") or row.get("tsCode") or "").strip()
                    code = self._extract_base_code(
                        row.get("code")
                        or row.get("symbol")
                        or row.get("stock_code")
                        or row.get("stockCode")
                        or ts_code
                    )
                    if not code:
                        continue
                    parsed[code] = {
                        "stock_name": (row.get("name") or row.get("stock_name") or row.get("stockName") or "").strip(),
                        "industry": (row.get("industry") or "").strip(),
                        "area": (row.get("area") or "").strip(),
                        "market": (row.get("market") or "").strip(),
                        "list_date": (row.get("list_date") or row.get("listDate") or "").strip(),
                        "act_name": (row.get("act_name") or row.get("actName") or "").strip(),
                        "act_ent_type": (row.get("act_ent_type") or row.get("actEntType") or "").strip(),
                    }
            return parsed

        fallback_path_value = (getattr(cfg, "a_share_universe_fallback_file", "") or "").strip()
        if fallback_path_value:
            fallback_path = Path(fallback_path_value)
            if not fallback_path.is_absolute():
                fallback_path = project_root / fallback_path
            merged.update(_parse_csv(fallback_path))

        snapshots = sorted(project_root.glob("tushare_stock_basic_*.csv"))
        if snapshots:
            for code, payload in _parse_csv(snapshots[-1]).items():
                existed = merged.get(code, {})
                merged[code] = {
                    "stock_name": existed.get("stock_name") or payload.get("stock_name") or "",
                    "industry": existed.get("industry") or payload.get("industry") or "",
                    "area": existed.get("area") or payload.get("area") or "",
                    "market": existed.get("market") or payload.get("market") or "",
                    "list_date": existed.get("list_date") or payload.get("list_date") or "",
                    "act_name": existed.get("act_name") or payload.get("act_name") or "",
                    "act_ent_type": existed.get("act_ent_type") or payload.get("act_ent_type") or "",
                }
        return merged

    def _build_profile_fallback_text(self, stock_name: str, basic_info: Dict[str, str]) -> Dict[str, str]:
        industry = (basic_info.get("industry") or "").strip()
        area = (basic_info.get("area") or "").strip()
        market = (basic_info.get("market") or "").strip()
        list_date = (basic_info.get("list_date") or "").strip()
        date_text = (
            f"{list_date[:4]}年{list_date[4:6]}月{list_date[6:8]}日"
            if len(list_date) == 8 and list_date.isdigit()
            else (list_date or "未知时间")
        )
        company_intro = (
            f"{stock_name}所属行业为{industry or '未知'}，注册地/主要经营地为{area or '未知'}，"
            f"上市板块为{market or '未知'}，上市时间为{date_text}。"
        )
        main_business = f"公司主营方向聚焦于{industry or '所属行业相关业务'}。"
        business_scope = (
            f"覆盖{industry or '主营'}产业链相关产品与服务，具体业务边界以公司公告与定期报告为准。"
        )
        return {
            "company_intro": company_intro,
            "main_business": main_business,
            "business_scope": business_scope,
        }

    @staticmethod
    def _safe_float(value: Any) -> Optional[float]:
        try:
            if value is None:
                return None
            parsed = float(value)
            if parsed != parsed:  # NaN
                return None
            return parsed
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _looks_like_foreign_code(stock_code: str) -> bool:
        code = (stock_code or "").strip().upper()
        if not code:
            return False
        if code.startswith("HK") and code[2:].isdigit():
            return True
        if code.endswith(".HK"):
            return True
        if re.match(r"^[0-9]{5}$", code):
            return True
        if re.match(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$", code):
            return True
        if re.match(r"^[A-Z]{1,5}\.US$", code):
            return True
        return False

    @staticmethod
    def _to_yfinance_symbol(stock_code: str) -> str:
        code = (stock_code or "").strip().upper()
        if not code:
            return ""
        if code.endswith(".US"):
            return code.split(".", 1)[0]
        if code.endswith(".HK"):
            base = code.split(".", 1)[0]
            if base.isdigit():
                return f"{int(base):04d}.HK"
            return code
        if code.startswith("HK") and code[2:].isdigit():
            return f"{int(code[2:]):04d}.HK"
        if code.isdigit() and len(code) == 5:
            return f"{int(code):04d}.HK"
        return code

    @staticmethod
    def _to_percent(value: Any) -> Optional[float]:
        parsed = StockService._safe_float(value)
        if parsed is None:
            return None
        # yfinance 常见比例字段通常在 0~1，统一换算为百分比
        if -1.0 <= parsed <= 1.0:
            return parsed * 100.0
        return parsed

    def _load_yfinance_insights(self, stock_code: str) -> Dict[str, Any]:
        symbol = self._to_yfinance_symbol(stock_code)
        if not symbol:
            return {}
        try:
            import yfinance as yf
        except Exception as e:
            logger.debug(f"yfinance 不可用，跳过兜底: {e}")
            return {}

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
            if not isinstance(info, dict) or not info:
                return {}

            long_name = str(info.get("longName") or info.get("shortName") or "").strip()
            industry = str(info.get("industry") or "").strip()
            area = str(info.get("country") or info.get("city") or "").strip()
            website = str(info.get("website") or "").strip()
            intro = str(info.get("longBusinessSummary") or "").strip()
            market = str(info.get("exchange") or "").strip()

            profile = {
                "stock_name": long_name or None,
                "company_name": long_name or None,
                "company_intro": intro or None,
                "main_business": industry or None,
                "business_scope": (
                    f"行业: {industry}; 官网: {website}" if industry or website else None
                ),
                "industry": industry or None,
                "area": area or None,
                "market": market or None,
            }
            metrics = {
                "pe_ratio": self._safe_float(info.get("trailingPE") or info.get("forwardPE")),
                "pb_ratio": self._safe_float(info.get("priceToBook")),
                "ps_ratio": self._safe_float(info.get("priceToSalesTrailing12Months")),
                "peg_ratio": self._safe_float(info.get("pegRatio")),
                "dividend_yield": self._to_percent(info.get("dividendYield")),
                "total_mv": self._safe_float(info.get("marketCap")),
                "roe": self._to_percent(info.get("returnOnEquity")),
                "roa": self._to_percent(info.get("returnOnAssets")),
                "gross_margin": self._to_percent(info.get("grossMargins")),
                "net_margin": self._to_percent(info.get("profitMargins")),
                "debt_ratio": self._safe_float(info.get("debtToEquity")),
                "revenue": self._safe_float(info.get("totalRevenue")),
                "net_profit_parent": self._safe_float(info.get("netIncomeToCommon")),
                "operating_cash_flow": self._safe_float(info.get("operatingCashflow")),
                "revenue_yoy": self._to_percent(info.get("revenueGrowth")),
                "net_profit_yoy": self._to_percent(info.get("earningsGrowth")),
            }
            return {
                "profile": profile,
                "financial_metrics": metrics,
                "source": "yfinance_info",
            }
        except Exception as e:
            logger.debug(f"yfinance 公司信息兜底失败: {e}")
            return {}

    def get_company_insights(self, stock_code: str) -> Dict[str, Any]:
        """
        聚合公司介绍与财务指标。

        设计原则：尽量复用已有基础面能力，任一来源失败都 fail-open。
        """
        normalized_code = self._extract_base_code(stock_code)
        basic_info_map = self._load_basic_info_map()
        basic_info = basic_info_map.get(normalized_code, {})
        stock_name = basic_info.get("stock_name") or normalized_code

        profile_source_chain: List[str] = []
        profile_text = self._build_profile_fallback_text(stock_name, basic_info)
        profile_source_chain.append("basic_info_fallback")

        try:
            from data_provider.base import DataFetcherManager

            manager = DataFetcherManager()
            fetched_name = manager.get_stock_name(normalized_code)
            if fetched_name:
                stock_name = fetched_name
                profile_source_chain.append("realtime_name")
                profile_text = self._build_profile_fallback_text(stock_name, basic_info)
        except Exception as e:
            logger.debug(f"获取股票名称失败（降级忽略）: {e}")

        metrics_source_chain: List[str] = []
        quote_payload: Dict[str, Any] = {}
        try:
            quote_payload = self.get_realtime_quote(normalized_code) or {}
            if quote_payload:
                metrics_source_chain.append("realtime_quote")
        except Exception as e:
            logger.debug(f"获取实时估值失败（降级忽略）: {e}")

        context_data: Dict[str, Any] = {}
        try:
            from data_provider.base import DataFetcherManager

            manager = DataFetcherManager()
            fundamental_context = manager.get_fundamental_context(normalized_code)
            if isinstance(fundamental_context, dict):
                context_data = fundamental_context
                if fundamental_context.get("source_chain"):
                    metrics_source_chain.extend(
                        [str(item) for item in fundamental_context.get("source_chain", []) if item]
                    )
        except Exception as e:
            logger.debug(f"获取基础面上下文失败（降级忽略）: {e}")

        valuation_data = (
            (((context_data.get("valuation") or {}).get("data") if isinstance(context_data.get("valuation"), dict) else {}) or {})
            if isinstance(context_data, dict)
            else {}
        )
        growth_data = (
            (((context_data.get("growth") or {}).get("data") if isinstance(context_data.get("growth"), dict) else {}) or {})
            if isinstance(context_data, dict)
            else {}
        )
        earnings_data = (
            (((context_data.get("earnings") or {}).get("data") if isinstance(context_data.get("earnings"), dict) else {}) or {})
            if isinstance(context_data, dict)
            else {}
        )
        financial_report = earnings_data.get("financial_report") if isinstance(earnings_data, dict) else {}
        dividend_metrics = {}
        if isinstance(earnings_data, dict):
            dividend_metrics = (
                earnings_data.get("dividend_metrics")
                or earnings_data.get("dividend")
                or {}
            )

        report_date = (
            (financial_report or {}).get("report_date")
            if isinstance(financial_report, dict)
            else None
        )

        profile_payload = {
            "stock_code": normalized_code,
            "stock_name": stock_name,
            "company_name": stock_name,
            "company_intro": profile_text.get("company_intro"),
            "main_business": profile_text.get("main_business"),
            "business_scope": profile_text.get("business_scope"),
            "industry": basic_info.get("industry") or None,
            "area": basic_info.get("area") or None,
            "market": basic_info.get("market") or None,
            "list_date": basic_info.get("list_date") or None,
            "act_name": basic_info.get("act_name") or None,
            "act_ent_type": basic_info.get("act_ent_type") or None,
            "source_chain": profile_source_chain,
        }

        metrics_payload = {
            "stock_code": normalized_code,
            "as_of": report_date or datetime.now().date().isoformat(),
            "pe_ratio": quote_payload.get("pe_ratio") or valuation_data.get("pe_ratio"),
            "pb_ratio": quote_payload.get("pb_ratio") or valuation_data.get("pb_ratio"),
            "ps_ratio": valuation_data.get("ps_ratio"),
            "peg_ratio": valuation_data.get("peg_ratio"),
            "dividend_yield": (
                (dividend_metrics or {}).get("ttm_dividend_yield_pct")
                if isinstance(dividend_metrics, dict)
                else None
            ),
            "total_mv": quote_payload.get("total_mv") or valuation_data.get("total_mv"),
            "circ_mv": quote_payload.get("circ_mv") or valuation_data.get("circ_mv"),
            "roe": (financial_report or {}).get("roe") if isinstance(financial_report, dict) else growth_data.get("roe"),
            "roa": growth_data.get("roa"),
            "gross_margin": growth_data.get("gross_margin"),
            "net_margin": growth_data.get("net_margin"),
            "debt_ratio": growth_data.get("debt_ratio"),
            "revenue": (financial_report or {}).get("revenue") if isinstance(financial_report, dict) else None,
            "net_profit_parent": (
                (financial_report or {}).get("net_profit_parent")
                if isinstance(financial_report, dict)
                else None
            ),
            "operating_cash_flow": (
                (financial_report or {}).get("operating_cash_flow")
                if isinstance(financial_report, dict)
                else None
            ),
            "revenue_yoy": growth_data.get("revenue_yoy"),
            "net_profit_yoy": growth_data.get("net_profit_yoy"),
            "source_chain": metrics_source_chain,
        }

        if self._looks_like_foreign_code(normalized_code):
            yf_payload = self._load_yfinance_insights(normalized_code)
            if yf_payload:
                yf_profile = yf_payload.get("profile", {})
                if isinstance(yf_profile, dict):
                    for field in (
                        "stock_name",
                        "company_name",
                        "company_intro",
                        "main_business",
                        "business_scope",
                        "industry",
                        "area",
                        "market",
                    ):
                        if not profile_payload.get(field) and yf_profile.get(field):
                            profile_payload[field] = yf_profile.get(field)
                    if yf_payload.get("source"):
                        profile_source_chain.append(str(yf_payload["source"]))

                yf_metrics = yf_payload.get("financial_metrics", {})
                if isinstance(yf_metrics, dict):
                    for field in (
                        "pe_ratio",
                        "pb_ratio",
                        "ps_ratio",
                        "peg_ratio",
                        "dividend_yield",
                        "total_mv",
                        "roe",
                        "roa",
                        "gross_margin",
                        "net_margin",
                        "debt_ratio",
                        "revenue",
                        "net_profit_parent",
                        "operating_cash_flow",
                        "revenue_yoy",
                        "net_profit_yoy",
                    ):
                        if metrics_payload.get(field) is None and yf_metrics.get(field) is not None:
                            metrics_payload[field] = yf_metrics.get(field)
                    if yf_payload.get("source"):
                        metrics_source_chain.append(str(yf_payload["source"]))

        return {
            "stock_code": normalized_code,
            "profile": profile_payload,
            "financial_metrics": metrics_payload,
        }
    
    def get_history_data(
        self,
        stock_code: str,
        period: str = "daily",
        days: int = 30
    ) -> Dict[str, Any]:
        """
        获取股票历史行情
        
        Args:
            stock_code: 股票代码
            period: K 线周期 (daily/weekly/monthly)
            days: 获取天数
            
        Returns:
            历史行情数据字典
        """
        # 验证 period 参数
        if period not in {"daily", "weekly", "monthly"}:
            raise ValueError(f"不支持的周期参数: {period}")
        
        try:
            # 调用数据获取器获取历史数据
            from data_provider.base import DataFetcherManager
            
            manager = DataFetcherManager()
            df, source = manager.get_daily_data(stock_code, days=days)
            
            if df is None or df.empty:
                logger.warning(f"获取 {stock_code} 历史数据失败")
                return {"stock_code": stock_code, "period": period, "data": []}
            
            # 获取股票名称
            stock_name = manager.get_stock_name(stock_code)
            
            normalized_df = self._normalize_history_df(df)
            if normalized_df.empty:
                return {"stock_code": stock_code, "period": period, "data": []}

            if period == "daily":
                output_df = normalized_df
            elif period == "weekly":
                output_df = self._aggregate_kline(normalized_df, "W-FRI")
            else:  # monthly
                output_df = self._aggregate_kline(normalized_df, "M")

            if output_df.empty:
                return {"stock_code": stock_code, "period": period, "data": []}

            # 转换为响应格式
            data = []
            for _, row in output_df.iterrows():
                date_val = row.get("date")
                if hasattr(date_val, "strftime"):
                    date_str = date_val.strftime("%Y-%m-%d")
                else:
                    date_str = str(date_val)
                
                data.append({
                    "date": date_str,
                    "open": float(row.get("open", 0)),
                    "high": float(row.get("high", 0)),
                    "low": float(row.get("low", 0)),
                    "close": float(row.get("close", 0)),
                    "volume": float(row.get("volume", 0)) if row.get("volume") else None,
                    "amount": float(row.get("amount", 0)) if row.get("amount") else None,
                    "change_percent": float(row.get("pct_chg", 0)) if row.get("pct_chg") else None,
                })
            
            return {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "period": period,
                "data": data,
            }
            
        except ImportError:
            logger.warning("DataFetcherManager 未找到，返回空数据")
            return {"stock_code": stock_code, "period": period, "data": []}
        except Exception as e:
            logger.error(f"获取历史数据失败: {e}", exc_info=True)
            return {"stock_code": stock_code, "period": period, "data": []}

    def _normalize_history_df(self, df: "pd.DataFrame") -> "pd.DataFrame":
        """
        规范化日线 DataFrame，确保可用于后续聚合。
        """
        normalized = df.copy()
        normalized["date"] = pd.to_datetime(normalized.get("date"), errors="coerce")
        normalized = normalized.dropna(subset=["date"])
        if normalized.empty:
            return normalized

        for col in ["open", "high", "low", "close", "volume", "amount", "pct_chg"]:
            if col in normalized.columns:
                normalized[col] = pd.to_numeric(normalized[col], errors="coerce")

        normalized = normalized.sort_values("date").reset_index(drop=True)
        return normalized

    def _aggregate_kline(self, daily_df: "pd.DataFrame", rule: str) -> "pd.DataFrame":
        """
        将日线聚合为周线/月线：
        - open: 首日开盘
        - high: 周期内最高
        - low: 周期内最低
        - close: 末日收盘
        - volume/amount: 周期求和
        """
        if daily_df.empty:
            return daily_df

        indexed = daily_df.set_index("date")
        agg = indexed.resample(rule).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
            "amount": "sum",
        })
        agg = agg.dropna(subset=["open", "high", "low", "close"])
        if agg.empty:
            return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume", "amount", "pct_chg"])

        # 聚合周期涨跌幅：以上一周期收盘为基准计算
        agg["pct_chg"] = agg["close"].pct_change() * 100
        agg = agg.reset_index()
        return agg
    
    def _get_placeholder_quote(self, stock_code: str) -> Dict[str, Any]:
        """
        获取占位行情数据（用于测试）
        
        Args:
            stock_code: 股票代码
            
        Returns:
            占位行情数据
        """
        return {
            "stock_code": stock_code,
            "stock_name": f"股票{stock_code}",
            "current_price": 0.0,
            "change": None,
            "change_percent": None,
            "open": None,
            "high": None,
            "low": None,
            "prev_close": None,
            "volume": None,
            "amount": None,
            "pe_ratio": None,
            "pb_ratio": None,
            "total_mv": None,
            "circ_mv": None,
            "update_time": datetime.now().isoformat(),
        }
