from pydantic import BaseModel, Field

from app.models import UserRole
from app.schemas.common import ORMModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORMModel):
    id: int
    username: str
    full_name: str
    role: UserRole
    is_active: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=10, max_length=128)
    role: UserRole = UserRole.COORDINATOR
