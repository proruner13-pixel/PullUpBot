import secrets

# Legacy only. WebApp authentication no longer uses these in-memory tokens.
# Kept temporarily so old imports fail safely during the bot cleanup.
tokens = {}  # token -> user_id

def generate_token(user_id: int) -> str:
    token = secrets.token_urlsafe(16)
    tokens[token] = user_id
    return token

def verify_token(token: str) -> int | None:
    return tokens.get(token)

