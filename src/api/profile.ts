import { apiRequest, type ProfileDto } from "./client";

export function getProfile(initData: string): Promise<ProfileDto> {
    return apiRequest<ProfileDto>(
        "/profile/me",
        { method: "GET" },
        initData
    );
}

export function updateProfileAvatar(
    initData: string,
    avatarUrl: string
): Promise<ProfileDto> {
    return apiRequest<ProfileDto>(
        "/profile/me/avatar",
        {
            method: "PATCH",
            body: JSON.stringify({ avatar_url: avatarUrl }),
        },
        initData
    );
}
