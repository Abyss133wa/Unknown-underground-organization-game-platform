"""数据库模型：招募（games）与报名（signups）。"""
import enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .database import Base


class GameStatus(str, enum.Enum):
    """招募状态，存储英文值，前端映射为中文展示。"""
    open = "open"
    full = "full"
    ended = "ended"


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)          # 游戏名称
    game_type = Column(String(50), nullable=True)        # 游戏类型
    description = Column(Text, nullable=True)            # 备注说明
    start_time = Column(DateTime, nullable=False)        # 开始时间
    end_time = Column(DateTime, nullable=False)          # 结束时间
    max_players = Column(Integer, nullable=False)        # 人数上限
    channel = Column(String(100), nullable=True)         # 开黑渠道/房间号
    creator_nickname = Column(String(50), nullable=False)  # 发起人昵称
    admin_token_hash = Column(String(64), nullable=False)  # 管理口令哈希
    status = Column(String(10), default=GameStatus.open.value, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    signups = relationship("Signup", backref="game", cascade="all, delete-orphan")


class Signup(Base):
    __tablename__ = "signups"
    __table_args__ = (
        UniqueConstraint("game_id", "nickname", name="uq_game_nickname"),
    )

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    nickname = Column(String(50), nullable=False)        # 参与者昵称
    remark = Column(String(200), nullable=True)          # 报名备注
    created_at = Column(DateTime, server_default=func.now())
