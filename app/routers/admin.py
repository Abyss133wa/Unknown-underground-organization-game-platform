"""管理员登录接口。"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..security import ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminLogin(BaseModel):
    username: str
    password: str


@router.post("/login")
def admin_login(payload: AdminLogin):
    if payload.username == ADMIN_USERNAME and payload.password == ADMIN_PASSWORD:
        return {"ok": True, "admin_token": ADMIN_TOKEN}
    raise HTTPException(status_code=401, detail="账号或密码错误")
