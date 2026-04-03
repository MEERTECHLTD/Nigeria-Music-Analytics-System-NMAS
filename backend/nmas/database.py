from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy.pool import NullPool, QueuePool
from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings


settings = get_settings()

connect_args: dict[str, object] = {}
engine_kwargs: dict[str, object] = {"echo": settings.debug}

if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs["poolclass"] = QueuePool
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10

engine = create_engine(settings.database_url, connect_args=connect_args, **engine_kwargs)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


@contextmanager
def session_scope() -> Session:
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

