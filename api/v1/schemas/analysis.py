# -*- coding: utf-8 -*-
"""
===================================
分析相关模型
===================================

职责：
1. 定义分析请求和响应模型
2. 定义任务状态模型
3. 定义异步任务队列相关模型
"""

from typing import Optional, List, Any
from enum import Enum

from pydantic import BaseModel, Field
from src.utils.analysis_metadata import SELECTION_SOURCE_PATTERN


class TaskStatusEnum(str, Enum):
    """任务状态枚举"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalyzeRequest(BaseModel):
    """Analysis request parameters"""
    
    stock_code: Optional[str] = Field(
        None, 
        description="单只股票代码", 
        example="600519"
    )
    stock_codes: Optional[List[str]] = Field(
        None, 
        description="多只股票代码（与 stock_code 二选一）",
        example=["600519", "000858"]
    )
    report_type: str = Field(
        "detailed",
        description="报告类型：simple(精简) / detailed(完整) / full(完整) / brief(简洁)",
        pattern="^(simple|detailed|full|brief)$",
    )
    force_refresh: bool = Field(
        False,
        description="是否强制刷新（忽略缓存）"
    )
    async_mode: bool = Field(
        False,
        description="是否使用异步模式"
    )
    stock_name: Optional[str] = Field(
        None,
        description="用户选中的股票名称（自动补全时提供）",
        example="贵州茅台"
    )
    original_query: Optional[str] = Field(
        None,
        description="用户原始输入（如茅台、gzmt、600519）",
        example="茅台"
    )
    selection_source: Optional[str] = Field(
        None,
        description="股票选择来源：manual(手动输入) | autocomplete(自动补全) | import(导入) | image(图片识别)",
        pattern=SELECTION_SOURCE_PATTERN,
        example="autocomplete"
    )
    notify: bool = Field(
        True,
        description="是否发送推送通知（Telegram/企业微信等）"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "report_type": "detailed",
                "force_refresh": False,
                "async_mode": False,
                "stock_name": "贵州茅台",
                "original_query": "茅台",
                "selection_source": "autocomplete",
                "notify": True
            }
        }


class AnalyzeUniverseRequest(BaseModel):
    """Universe analysis request parameters."""

    universe: str = Field(
        "a_share",
        description="股票池标识，当前仅支持 a_share",
        pattern="^a_share$",
    )
    notify: bool = Field(
        True,
        description="是否发送推送通知（Telegram/企业微信等）",
    )
    chunk_size: Optional[int] = Field(
        None,
        description="单批入队数量（为空时使用后端默认配置）",
        ge=1,
        le=100,
    )

    class Config:
        json_schema_extra = {
            "example": {
                "universe": "a_share",
                "notify": True,
                "chunk_size": 50,
            }
        }


class AnalysisResultResponse(BaseModel):
    """分析结果响应模型"""
    
    query_id: str = Field(..., description="分析记录唯一标识")
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    report: Optional[Any] = Field(None, description="分析报告")
    created_at: str = Field(..., description="创建时间")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query_id": "abc123def456",
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "report": {
                    "summary": {
                        "sentiment_score": 75,
                        "operation_advice": "持有"
                    }
                },
                "created_at": "2024-01-01T12:00:00"
            }
        }


class TaskAccepted(BaseModel):
    """异步任务接受响应"""
    
    task_id: str = Field(..., description="任务 ID，用于查询状态")
    status: str = Field(
        ..., 
        description="任务状态",
        pattern="^(pending|processing)$"
    )
    message: Optional[str] = Field(None, description="提示信息")
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "task_abc123",
                "status": "pending",
                "message": "Analysis task accepted"
            }
        }


class BatchTaskAcceptedItem(BaseModel):
    """批量异步任务中的单个成功提交项。"""

    task_id: str = Field(..., description="任务 ID，用于查询状态")
    stock_code: str = Field(..., description="股票代码")
    status: str = Field(
        ...,
        description="任务状态",
        pattern="^(pending|processing)$"
    )
    message: Optional[str] = Field(None, description="提示信息")

    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "task_abc123",
                "stock_code": "600519",
                "status": "pending",
                "message": "分析任务已加入队列: 600519"
            }
        }


class BatchDuplicateTaskItem(BaseModel):
    """批量异步任务中的重复提交项。"""

    stock_code: str = Field(..., description="股票代码")
    existing_task_id: str = Field(..., description="已存在的任务 ID")
    message: str = Field(..., description="错误信息")

    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "existing_task_id": "task_existing_123",
                "message": "股票 600519 正在分析中 (task_id: task_existing_123)"
            }
        }


class BatchTaskAcceptedResponse(BaseModel):
    """批量异步任务接受响应。"""

    accepted: List[BatchTaskAcceptedItem] = Field(default_factory=list, description="成功提交的任务列表")
    duplicates: List[BatchDuplicateTaskItem] = Field(default_factory=list, description="重复而跳过的任务列表")
    message: str = Field(..., description="汇总信息")

    class Config:
        json_schema_extra = {
            "example": {
                "accepted": [
                    {
                        "task_id": "task_abc123",
                        "stock_code": "600519",
                        "status": "pending",
                        "message": "分析任务已加入队列: 600519"
                    }
                ],
                "duplicates": [
                    {
                        "stock_code": "000858",
                        "existing_task_id": "task_existing_456",
                        "message": "股票 000858 正在分析中 (task_id: task_existing_456)"
                    }
                ],
                "message": "已提交 1 个任务，1 个重复跳过"
            }
        }


class AnalyzeUniverseAcceptedResponse(BaseModel):
    """Universe async submission summary."""

    universe: str = Field(..., description="股票池标识")
    source: str = Field(..., description="股票池来源：tushare 或 fallback_file")
    total_symbols: int = Field(..., description="股票池总数量")
    chunk_size: int = Field(..., description="分批大小")
    chunk_count: int = Field(..., description="分批数量")
    submitted_tasks: int = Field(..., description="本次成功提交任务数量")
    duplicate_tasks: int = Field(..., description="重复跳过任务数量")
    sample_task_ids: List[str] = Field(default_factory=list, description="示例任务 ID（最多前 10 个）")
    message: str = Field(..., description="汇总信息")

    class Config:
        json_schema_extra = {
            "example": {
                "universe": "a_share",
                "source": "tushare",
                "total_symbols": 5310,
                "chunk_size": 50,
                "chunk_count": 107,
                "submitted_tasks": 5288,
                "duplicate_tasks": 22,
                "sample_task_ids": ["task_xxx1", "task_xxx2"],
                "message": "已提交全A分析任务：总计 5310 只，成功 5288，重复跳过 22",
            }
        }


class UniverseStockItem(BaseModel):
    """Universe stock item."""

    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    area: Optional[str] = Field(None, description="地域")
    industry: Optional[str] = Field(None, description="行业")
    market: Optional[str] = Field(None, description="市场板块")
    list_date: Optional[str] = Field(None, description="上市日期（YYYYMMDD）")
    symbol: Optional[str] = Field(None, description="证券代码（不带后缀）")
    ts_code: Optional[str] = Field(None, description="Tushare 标准代码")
    cnspell: Optional[str] = Field(None, description="股票名称拼音缩写")
    act_name: Optional[str] = Field(None, description="实控人名称")
    act_ent_type: Optional[str] = Field(None, description="实控人企业性质")
    has_analyzed: bool = Field(False, description="是否存在历史分析记录")

    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "area": "贵州",
                "industry": "白酒",
                "market": "主板",
                "list_date": "20010827",
                "symbol": "600519",
                "ts_code": "600519.SH",
                "cnspell": "GZMT",
                "act_name": "贵州省人民政府国有资产监督管理委员会",
                "act_ent_type": "地方国有企业",
                "has_analyzed": True,
            }
        }


class UniverseStockListResponse(BaseModel):
    """Universe stock list response."""

    universe: str = Field(..., description="股票池标识")
    source: str = Field(..., description="股票池来源：tushare、fallback_file 或 none")
    total_symbols: int = Field(..., description="股票池总数量")
    items: List[UniverseStockItem] = Field(default_factory=list, description="股票列表")

    class Config:
        json_schema_extra = {
            "example": {
                "universe": "a_share",
                "source": "tushare",
                "total_symbols": 5310,
                "items": [
                    {
                        "stock_code": "600519",
                        "stock_name": "贵州茅台",
                    }
                ],
            }
        }


class TaskStatus(BaseModel):
    """Task status model"""
    
    task_id: str = Field(..., description="任务 ID")
    status: str = Field(
        ..., 
        description="任务状态",
        pattern="^(pending|processing|completed|failed)$"
    )
    progress: Optional[int] = Field(
        None, 
        description="进度百分比 (0-100)",
        ge=0,
        le=100
    )
    result: Optional[AnalysisResultResponse] = Field(
        None, 
        description="分析结果（仅在 completed 时存在）"
    )
    error: Optional[str] = Field(
        None, 
        description="错误信息（仅在 failed 时存在）"
    )
    stock_name: Optional[str] = Field(None, description="股票名称")
    original_query: Optional[str] = Field(None, description="用户原始输入")
    selection_source: Optional[str] = Field(
        None,
        description="选择来源",
        pattern=SELECTION_SOURCE_PATTERN,
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "task_abc123",
                "status": "completed",
                "progress": 100,
                "result": None,
                "error": None,
                "stock_name": "贵州茅台",
                "original_query": "茅台",
                "selection_source": "autocomplete"
            }
        }


class TaskInfo(BaseModel):
    """
    Task details model

    Used for task list and SSE event delivery
    """
    
    task_id: str = Field(..., description="任务 ID")
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    status: TaskStatusEnum = Field(..., description="任务状态")
    progress: int = Field(0, description="进度百分比 (0-100)", ge=0, le=100)
    message: Optional[str] = Field(None, description="状态消息")
    report_type: str = Field("detailed", description="报告类型")
    created_at: str = Field(..., description="创建时间")
    started_at: Optional[str] = Field(None, description="开始执行时间")
    completed_at: Optional[str] = Field(None, description="完成时间")
    error: Optional[str] = Field(None, description="错误信息（仅在 failed 时存在）")
    original_query: Optional[str] = Field(None, description="用户原始输入")
    selection_source: Optional[str] = Field(
        None,
        description="选择来源",
        pattern=SELECTION_SOURCE_PATTERN,
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "abc123def456",
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "status": "processing",
                "progress": 50,
                "message": "正在分析中...",
                "report_type": "detailed",
                "created_at": "2026-02-05T10:30:00",
                "started_at": "2026-02-05T10:30:01",
                "completed_at": None,
                "error": None,
                "original_query": "茅台",
                "selection_source": "autocomplete"
            }
        }


class TaskListResponse(BaseModel):
    """任务列表响应模型"""
    
    total: int = Field(..., description="任务总数")
    pending: int = Field(..., description="等待中的任务数")
    processing: int = Field(..., description="处理中的任务数")
    tasks: List[TaskInfo] = Field(..., description="任务列表")
    
    class Config:
        json_schema_extra = {
            "example": {
                "total": 3,
                "pending": 1,
                "processing": 2,
                "tasks": []
            }
        }


class DuplicateTaskErrorResponse(BaseModel):
    """重复任务错误响应模型"""
    
    error: str = Field("duplicate_task", description="错误类型")
    message: str = Field(..., description="错误信息")
    stock_code: str = Field(..., description="股票代码")
    existing_task_id: str = Field(..., description="已存在的任务 ID")
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "duplicate_task",
                "message": "股票 600519 正在分析中",
                "stock_code": "600519",
                "existing_task_id": "abc123def456"
            }
        }
