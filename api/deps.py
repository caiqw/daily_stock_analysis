# -*- coding: utf-8 -*-
"""
===================================
API 依赖注入模块
===================================

职责：
1. 提供数据库 Session 依赖
2. 提供配置依赖
3. 提供服务层依赖
"""

from typing import Generator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from src.storage import DatabaseManager
from src.config import get_config, Config
from src.auth import COOKIE_NAME, ROLE_SUPER_ADMIN, get_role_capabilities, parse_session
from src.services.system_config_service import SystemConfigService


def get_db() -> Generator[Session, None, None]:
    """
    获取数据库 Session 依赖
    
    使用 FastAPI 依赖注入机制，确保请求结束后自动关闭 Session
    
    Yields:
        Session: SQLAlchemy Session 对象
        
    Example:
        @router.get("/items")
        async def get_items(db: Session = Depends(get_db)):
            ...
    """
    db_manager = DatabaseManager.get_instance()
    session = db_manager.get_session()
    try:
        yield session
    finally:
        session.close()


def get_config_dep() -> Config:
    """
    获取配置依赖
    
    Returns:
        Config: 配置单例对象
    """
    return get_config()


def get_database_manager() -> DatabaseManager:
    """
    获取数据库管理器依赖
    
    Returns:
        DatabaseManager: 数据库管理器单例对象
    """
    return DatabaseManager.get_instance()


def get_system_config_service(request: Request) -> SystemConfigService:
    """Get app-lifecycle shared SystemConfigService instance."""
    service = getattr(request.app.state, "system_config_service", None)
    if service is None:
        service = SystemConfigService()
        request.app.state.system_config_service = service
    return service


def get_current_user_role(request: Request) -> str:
    """Resolve current session role from signed cookie."""
    cookie_val = request.cookies.get(COOKIE_NAME)
    parsed = parse_session(cookie_val) if cookie_val else None
    if not parsed:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Login required"},
        )
    return parsed["role"]


def require_super_admin(request: Request) -> str:
    """Allow only super-admin session."""
    role = get_current_user_role(request)
    if role != ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Super admin permission required"},
        )
    return role


def enforce_capability(request: Request, capability_key: str) -> str:
    """Enforce runtime capability based on current role."""
    role = get_current_user_role(request)
    caps = get_role_capabilities(role)
    if not caps.get(capability_key, False):
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "You do not have permission to perform this action"},
        )
    return role
