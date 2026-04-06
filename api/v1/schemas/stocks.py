# -*- coding: utf-8 -*-
"""
===================================
股票数据相关模型
===================================

职责：
1. 定义股票实时行情模型
2. 定义历史 K 线数据模型
"""

from typing import Optional, List

from pydantic import BaseModel, Field


class StockQuote(BaseModel):
    """股票实时行情"""
    
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    current_price: float = Field(..., description="当前价格")
    change: Optional[float] = Field(None, description="涨跌额")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    open: Optional[float] = Field(None, description="开盘价")
    high: Optional[float] = Field(None, description="最高价")
    low: Optional[float] = Field(None, description="最低价")
    prev_close: Optional[float] = Field(None, description="昨收价")
    volume: Optional[float] = Field(None, description="成交量（股）")
    amount: Optional[float] = Field(None, description="成交额（元）")
    update_time: Optional[str] = Field(None, description="更新时间")
    pe_ratio: Optional[float] = Field(None, description="市盈率（动态）")
    pb_ratio: Optional[float] = Field(None, description="市净率")
    total_mv: Optional[float] = Field(None, description="总市值（元）")
    circ_mv: Optional[float] = Field(None, description="流通市值（元）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "current_price": 1800.00,
                "change": 15.00,
                "change_percent": 0.84,
                "open": 1785.00,
                "high": 1810.00,
                "low": 1780.00,
                "prev_close": 1785.00,
                "volume": 10000000,
                "amount": 18000000000,
                "update_time": "2024-01-01T15:00:00",
                "pe_ratio": 18.2,
                "pb_ratio": 3.8,
                "total_mv": 2250000000000,
                "circ_mv": 2240000000000,
            }
        }


class StockCompanyProfile(BaseModel):
    """公司简介与主营信息"""

    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    company_name: Optional[str] = Field(None, description="公司全称")
    company_intro: Optional[str] = Field(None, description="公司介绍")
    main_business: Optional[str] = Field(None, description="主营业务")
    business_scope: Optional[str] = Field(None, description="业务范围")
    industry: Optional[str] = Field(None, description="行业")
    area: Optional[str] = Field(None, description="地域")
    market: Optional[str] = Field(None, description="市场板块")
    list_date: Optional[str] = Field(None, description="上市日期（YYYYMMDD）")
    act_name: Optional[str] = Field(None, description="实控人名称")
    act_ent_type: Optional[str] = Field(None, description="实控人企业性质")
    source_chain: List[str] = Field(default_factory=list, description="数据来源链路")


class StockFinancialMetrics(BaseModel):
    """结构化财务指标"""

    stock_code: str = Field(..., description="股票代码")
    as_of: Optional[str] = Field(None, description="指标口径时间")
    pe_ratio: Optional[float] = Field(None, description="市盈率（动态）")
    pb_ratio: Optional[float] = Field(None, description="市净率")
    ps_ratio: Optional[float] = Field(None, description="市销率")
    peg_ratio: Optional[float] = Field(None, description="PEG")
    dividend_yield: Optional[float] = Field(None, description="股息率（%）")
    total_mv: Optional[float] = Field(None, description="总市值（元）")
    circ_mv: Optional[float] = Field(None, description="流通市值（元）")
    roe: Optional[float] = Field(None, description="净资产收益率（%）")
    roa: Optional[float] = Field(None, description="总资产收益率（%）")
    gross_margin: Optional[float] = Field(None, description="毛利率（%）")
    net_margin: Optional[float] = Field(None, description="净利率（%）")
    debt_ratio: Optional[float] = Field(None, description="资产负债率（%）")
    revenue: Optional[float] = Field(None, description="营收")
    net_profit_parent: Optional[float] = Field(None, description="归母净利润")
    operating_cash_flow: Optional[float] = Field(None, description="经营现金流")
    revenue_yoy: Optional[float] = Field(None, description="营收同比（%）")
    net_profit_yoy: Optional[float] = Field(None, description="净利润同比（%）")
    source_chain: List[str] = Field(default_factory=list, description="数据来源链路")


class StockCompanyInsightsResponse(BaseModel):
    """公司信息与财务指标联合响应"""

    stock_code: str = Field(..., description="股票代码")
    profile: StockCompanyProfile = Field(..., description="公司介绍与主营信息")
    financial_metrics: StockFinancialMetrics = Field(..., description="财务指标")


class KLineData(BaseModel):
    """K 线数据点"""
    
    date: str = Field(..., description="日期")
    open: float = Field(..., description="开盘价")
    high: float = Field(..., description="最高价")
    low: float = Field(..., description="最低价")
    close: float = Field(..., description="收盘价")
    volume: Optional[float] = Field(None, description="成交量")
    amount: Optional[float] = Field(None, description="成交额")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "date": "2024-01-01",
                "open": 1785.00,
                "high": 1810.00,
                "low": 1780.00,
                "close": 1800.00,
                "volume": 10000000,
                "amount": 18000000000,
                "change_percent": 0.84
            }
        }


class ExtractItem(BaseModel):
    """单条提取结果（代码、名称、置信度）"""

    code: Optional[str] = Field(None, description="股票代码，None 表示解析失败")
    name: Optional[str] = Field(None, description="股票名称（如有）")
    confidence: str = Field("medium", description="置信度：high/medium/low")


class ExtractFromImageResponse(BaseModel):
    """图片股票代码提取响应"""

    codes: List[str] = Field(..., description="提取的股票代码（已去重，向后兼容）")
    items: List[ExtractItem] = Field(default_factory=list, description="提取结果明细（代码+名称+置信度）")
    raw_text: Optional[str] = Field(None, description="原始 LLM 响应（调试用）")


class StockHistoryResponse(BaseModel):
    """股票历史行情响应"""
    
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    period: str = Field(..., description="K 线周期")
    data: List[KLineData] = Field(default_factory=list, description="K 线数据列表")
    
    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "period": "daily",
                "data": []
            }
        }
