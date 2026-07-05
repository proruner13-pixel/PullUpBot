import { apiRequest } from "./client";


export interface ApiHealthResponse {
    status: string;
    database: string;
}


export function checkApiHealth(): Promise<ApiHealthResponse> {
    return apiRequest<ApiHealthResponse>("/api/health/full", {
        method: "GET",
    });
}
