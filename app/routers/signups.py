"""报名相关的接口：报名 / 取消报名。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..serializers import refresh_expired, to_out

router = APIRouter(prefix="/api/games", tags=["signups"])


@router.post("/{game_id}/join", response_model=schemas.GameOut)
def join_game(game_id: int, payload: schemas.SignupCreate, db: Session = Depends(get_db)):
    g = db.get(models.Game, game_id)
    if not g:
        raise HTTPException(status_code=404, detail="招募不存在")
    refresh_expired(db)
    db.refresh(g)
    if g.status == models.GameStatus.ended.value:
        raise HTTPException(status_code=409, detail="该招募已结束")
    if g.status == models.GameStatus.full.value:
        raise HTTPException(status_code=409, detail="该招募已满员")

    s = models.Signup(game_id=game_id, nickname=payload.nickname, remark=payload.remark)
    db.add(s)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="你已报名该招募")

    # 插入后再计数，避免并发抢最后一个名额时超员
    count = db.query(models.Signup).filter_by(game_id=game_id).count()
    if count > g.max_players:
        db.rollback()
        raise HTTPException(status_code=409, detail="该招募已满员")
    if count >= g.max_players:
        g.status = models.GameStatus.full.value
    db.commit()
    db.refresh(g)
    return to_out(g)


@router.delete("/{game_id}/join", response_model=schemas.GameOut)
def leave_game(
    game_id: int,
    nickname: str = Query(..., description="参与者昵称"),
    db: Session = Depends(get_db),
):
    nickname = nickname.strip()
    g = db.get(models.Game, game_id)
    if not g:
        raise HTTPException(status_code=404, detail="招募不存在")
    s = (
        db.query(models.Signup)
        .filter_by(game_id=game_id, nickname=nickname)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="未找到该昵称的报名记录")
    db.delete(s)
    if g.status == models.GameStatus.full.value:
        g.status = models.GameStatus.open.value  # 空出名额后重新开放
    db.commit()
    db.refresh(g)
    return to_out(g)
