"""共享的模型转换与状态维护逻辑。"""
from datetime import datetime

from sqlalchemy.orm import Session

from . import models, schemas


def refresh_expired(db: Session) -> None:
    """把已过结束时间、但尚未标记的招募自动置为「已结束」。"""
    now = datetime.now()
    expired = (
        db.query(models.Game)
        .filter(
            models.Game.status != models.GameStatus.ended.value,
            models.Game.end_time < now,
        )
        .all()
    )
    for g in expired:
        g.status = models.GameStatus.ended.value
    if expired:
        db.commit()


def to_out(g: models.Game) -> schemas.GameOut:
    """把 ORM 对象转换为响应模型，附上报名人数与名单。"""
    out = schemas.GameOut.model_validate(g)
    out.signup_count = len(g.signups)
    out.signups = [schemas.SignupOut.model_validate(s) for s in g.signups]
    return out
