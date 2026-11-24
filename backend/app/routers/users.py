from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token, get_current_user, hash_password, require_admin, verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas.auth import Token, UserCreate, UserOut

router = APIRouter(prefix="/api", tags=["auth & users"])


@router.post("/auth/login", response_model=Token, summary="Coordinator login (OAuth2 password flow)")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == form.username))
    if user is None or not user.is_active or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    return Token(access_token=create_access_token(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.post("/users", response_model=UserOut, status_code=201, dependencies=[Depends(require_admin)])
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    user = User(
        username=body.username, full_name=body.full_name,
        hashed_password=hash_password(body.password), role=body.role,
    )
    db.add(user)
    db.commit()
    return user
