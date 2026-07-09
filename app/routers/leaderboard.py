from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.leaderboard import (
    get_my_leaderboard_rank,
    get_total_users,
    list_leaderboard,
    list_leaderboard_around_user,
)
from app.schemas import (
    LeaderboardAroundEntryResponse,
    LeaderboardAroundMeResponse,
    LeaderboardCurrentUserResponse,
    LeaderboardEntryResponse,
    LeaderboardListResponse,
    MyLeaderboardRankResponse,
)


router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard/me", response_model=MyLeaderboardRankResponse)
async def get_my_leaderboard(
    current_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> MyLeaderboardRankResponse:
    async with database.connection() as connection:
        row = await get_my_leaderboard_rank(
            connection,
            telegram_id=current_user.id,
        )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current user is not registered in leaderboard",
        )
    data = dict(row)
    user = LeaderboardCurrentUserResponse(
        id=data["id"],
        telegram_id=data["telegram_id"],
        username=data["username"],
        first_name=data["first_name"],
        avatar_url=data["avatar_url"],
        xp=data["xp"],
        level=data["level"],
        balance=data["balance"],
        approved_workouts=data["approved_workouts"],
    )
    return MyLeaderboardRankResponse(
        rank=data["rank"],
        total_users=data["total_users"],
        users_above=data["users_above"],
        users_below=data["users_below"],
        user=user,
    )


@router.get("/leaderboard/around-me", response_model=LeaderboardAroundMeResponse)
async def get_leaderboard_around_me(
    radius: int = Query(default=3, ge=0, le=10),
    current_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> LeaderboardAroundMeResponse:
    async with database.connection() as connection:
        rank_row = await get_my_leaderboard_rank(
            connection,
            telegram_id=current_user.id,
        )
        if rank_row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Current user is not registered in leaderboard",
            )
        rows = await list_leaderboard_around_user(
            connection,
            telegram_id=current_user.id,
            radius=radius,
        )
    return LeaderboardAroundMeResponse(
        rank=rank_row["rank"],
        total_users=rank_row["total_users"],
        items=[
            LeaderboardAroundEntryResponse(**dict(row))
            for row in rows
        ],
    )


@router.get("/leaderboard", response_model=LeaderboardListResponse)
async def get_leaderboard(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> LeaderboardListResponse:
    async with database.connection() as connection:
        rows = await list_leaderboard(
            connection,
            limit=limit,
            offset=offset,
        )
        total_users = await get_total_users(connection)
    return LeaderboardListResponse(
        total_users=total_users,
        items=[LeaderboardEntryResponse(**dict(row)) for row in rows],
    )
