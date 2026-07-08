import { apiRequest, type ProfileDto } from "./client";
import { normalizeProfileResponse } from "./auth";

export async function getProfile(initData: string): Promise<ProfileDto> {
    const response = await apiRequest<unknown>(
        "/profile/me",
        { method: "GET" },
        initData
    );
    return normalizeProfileResponse(response);
}

export async function updateProfileAvatar(
    initData: string,
    avatarUrl: string
): Promise<ProfileDto> {
    const response = await apiRequest<unknown>(
        "/profile/me/avatar",
        {
            method: "PATCH",
            body: JSON.stringify({ avatar_url: avatarUrl }),
        },
        initData
    );
    return normalizeProfileResponse(response);
}
