"""招募相关的接口：创建 / 列表 / 详情 / 编辑 / 删除。"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import ADMIN_TOKEN, generate_admin_token, hash_token
from ..serializers import refresh_expired, to_out

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("", response_model=List[schemas.GameOut])
def list_games(
    status: Optional[str] = Query(None, description="按状态筛选：open / full / ended"),
    upcoming: Optional[bool] = Query(None, description="仅看未开始且未结束的"),
    db: Session = Depends(get_db),
):
    refresh_expired(db)
    q = db.query(models.Game).order_by(models.Game.start_time.asc())
    if status:
        q = q.filter(models.Game.status == status)
    if upcoming:
        q = q.filter(
            models.Game.status != models.GameStatus.ended.value,
            models.Game.end_time >= models.Game.start_time,
        )
    return [to_out(g) for g in q.all()]


@router.post("", response_model=schemas.GameOut)
def create_game(payload: schemas.GameCreate, db: Session = Depends(get_db)):
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="结束时间必须晚于开始时间")
    token = generate_admin_token()
    g = models.Game(
        title=payload.title,
        game_type=payload.game_type,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        max_players=payload.max_players,
        channel=payload.channel,
        creator_nickname=payload.creator_nickname,
        admin_token_hash=hash_token(token),
        status=models.GameStatus.open.value,
    )
    db.add(g)
    db.flush()  # 先拿到 g.id，用于给发起人自动报名
    # 发起人自动报名自己发布的招募
    db.add(models.Signup(game_id=g.id, nickname=payload.creator_nickname))
    if g.max_players <= 1:
        g.status = models.GameStatus.full.value  # 1 人局发起后即满员
    db.commit()
    db.refresh(g)
    out = to_out(g)
    out.admin_token = token  # 仅此处一次性返回明文口令
    return out


@router.get("/me", response_model=List[schemas.GameOut])
def my_games(
    nickname: str = Query(..., description="参与者昵称"),
    db: Session = Depends(get_db),
):
    refresh_expired(db)
    q = (
        db.query(models.Game)
        .join(models.Signup, models.Signup.game_id == models.Game.id)
        .filter(models.Signup.nickname == nickname)
        .order_by(models.Game.start_time.asc())
    )
    return [to_out(g) for g in q.all()]


@router.get("/mine", response_model=List[schemas.GameOut])
def my_created_games(
    nickname: str = Query(..., description="发起人昵称"),
    db: Session = Depends(get_db),
):
    refresh_expired(db)
    q = (
        db.query(models.Game)
        .filter(models.Game.creator_nickname == nickname)
        .order_by(models.Game.start_time.asc())
    )
    return [to_out(g) for g in q.all()]


@router.get("/{game_id}", response_model=schemas.GameOut)
def get_game(game_id: int, db: Session = Depends(get_db)):
    g = db.get(models.Game, game_id)
    if not g:
        raise HTTPException(status_code=404, detail="招募不存在")
    refresh_expired(db)
    db.refresh(g)
    return to_out(g)


@router.patch("/{game_id}", response_model=schemas.GameOut)
def update_game(
    game_id: int,
    payload: schemas.GameUpdate,
    x_admin_token: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    g = db.get(models.Game, game_id)
    if not g:
        raise HTTPException(status_code=404, detail="招募不存在")
    if x_admin_token != ADMIN_TOKEN:
        if not payload.admin_token or hash_token(payload.admin_token) != g.admin_token_hash:
            raise HTTPException(status_code=403, detail="管理口令错误")

    data = payload.model_dump(exclude_unset=True, exclude={"admin_token"})
    # 校验时间（若本次同时提供了起止时间）
    new_start = data.get("start_time", g.start_time)
    new_end = data.get("end_time", g.end_time)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="结束时间必须晚于开始时间")

    for key, value in data.items():
        setattr(g, key, value)
    db.commit()
    db.refresh(g)
    return to_out(g)


@router.delete("/{game_id}")
def delete_game(
    game_id: int,
    admin_token: Optional[str] = Query(None, description="管理口令"),
    x_admin_token: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    g = db.get(models.Game, game_id)
    if not g:
        raise HTTPException(status_code=404, detail="招募不存在")
    if x_admin_token != ADMIN_TOKEN:
        if not admin_token or hash_token(admin_token) != g.admin_token_hash:
            raise HTTPException(status_code=403, detail="管理口令错误")
    db.delete(g)
    db.commit()
    return {"ok": True}
