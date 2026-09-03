"""管理口令的生成与校验。"""
import hashlib
import secrets

# 管理员账号（小群内部工具，硬编码即可）
ADMIN_USERNAME = "root"
ADMIN_PASSWORD = "root7788"
ADMIN_TOKEN = "admin-root-7788"  # 登录成功后返回给前端的令牌


def generate_admin_token() -> str:
    """生成随机管理口令，创建招募时返回给发起人（仅展示一次）。"""
    return secrets.token_urlsafe(16)


def hash_token(token: str) -> str:
    """口令哈希，数据库中只存哈希，不存明文。"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
