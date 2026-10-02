import os
import jwt
from datetime import datetime, timedelta, timezone
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # argon2
DUMMY_HASH = password_hash.hash("not-a-real-password")

SECRET_KEY = os.environ["SECRET_KEY"]  # fail loudly if it's missing
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "30"))

def verify_password(plain: str, hashed: str) -> bool:
    return password_hash.verify(plain, hashed)

def create_access_token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": sub, "role": role, "exp": exp}, SECRET_KEY, algorithm="HS256")