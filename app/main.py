"""应用入口：装配路由、静态资源与首页。"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  # 确保模型注册到 metadata
from .database import engine, Base
from .routers import admin, games, signups

# 启动时自动建表（SQLite）
Base.metadata.create_all(bind=engine)

app = FastAPI(title="游戏邀约平台", version="1.0.0")

app.include_router(admin.router)
app.include_router(games.router)
app.include_router(signups.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))
