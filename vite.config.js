import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";


function validateProductionApiUrl(value) {
    const apiUrl = value.trim().replace(/\/$/, "");
    if (!apiUrl) {
        throw new Error("VITE_API_URL is required in production");
    }

    let parsed;
    try {
        parsed = new URL(apiUrl);
    } catch {
        throw new Error(
            "VITE_API_URL имеет неверный формат. " +
            "Ожидается публичный HTTPS URL."
        );
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1"
    ) {
        throw new Error(
            "VITE_API_URL указывает на localhost. " +
            "Production build запрещён."
        );
    }
    if (parsed.protocol !== "https:") {
        throw new Error(
            "VITE_API_URL должен использовать HTTPS в production."
        );
    }
}


export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    if (command === "build") {
        validateProductionApiUrl(
            process.env.VITE_API_URL || env.VITE_API_URL || ""
        );
    }

    return {
        plugins: [react()],
    };
});
