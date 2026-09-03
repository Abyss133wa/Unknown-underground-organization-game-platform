"""Pydantic 请求/响应模型。"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict


class GameCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    game_type: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=1000)
    start_time: datetime
    end_time: datetime
    max_players: int = Field(..., gt=0, le=1000)
    channel: Optional[str] = Field(None, max_length=100)
    creator_nickname: str = Field(..., min_length=1, max_length=50)


class GameUpdate(BaseModel):
    admin_token: Optional[str] = None  # 发起人管理口令；管理员免口令
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    game_type: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=1000)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_players: Optional[int] = Field(None, gt=0, le=1000)
    channel: Optional[str] = Field(None, max_length=100)


class SignupCreate(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=50)
    remark: Optional[str] = Field(None, max_length=200)


class SignupOut(BaseModel):
    id: int
    nickname: str
    remark: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GameOut(BaseModel):
    id: int
    title: str
    game_type: Optional[str]
    description: Optional[str]
    start_time: datetime
    end_time: datetime
    max_players: int
    channel: Optional[str]
    creator_nickname: str
    status: str
    created_at: datetime
    signup_count: int = 0
    signups: List[SignupOut] = []
    admin_token: Optional[str] = None  # 仅在创建时一次性返回

    model_config = ConfigDict(from_attributes=True)
