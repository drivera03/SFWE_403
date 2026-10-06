# SFWE 403



**Requirements**

 * Docker Desktop 
 * Git




 Confirm that docker is installed
 ```
 docker --version 
 docker compose version
```

 ## Setup
 1. Clone the repo 
 ```
git clone<repo-url>
cd clinical-lab-management-system
```
 2. Make sure Docker Desktop is open and running

 3. Start everything
```
 docker compose up -d
```
 This builds and start the backend, frontend, and database together

The Compose configuration includes a placeholder `SECRET_KEY` for local testing.
See below for generating your own secret when testing directly in a terminal.

## URLs

* Frontend: http://localhost:5173/
* Backend: http://localhost:8000
* API Docs: http://localhost:8000/docs
* Health Check: http://localhost:8000/health
* DB Check: http://localhost:8000/db-check




## Common Docker commands (All in the terminal)


Start everything 
```
Docker compose up -d 
```
Stop everything
```
docker compose down
```
View logs(all)
```
docker compose logs
```
View logs (one service)
```
docker compose logs <service>
```
Check running containers
```
docker compose ps
```
Rebuild after dependency changes
```
docker compose up -d --build
```

## **Notes**
 
Code changes in the backend and frontend should auto-reload. 

Rebuild only when you add a new package(requirements.txt or package.json changes)

## JWT utilities

`backend/app/security.py` provides `create_access_token(sub, role, expires_delta=None)`
and `decode_access_token(token)`. Decoding verifies the HS256 signature, requires
non-empty string `sub` and `role` claims and an integer `exp`, and rejects expired
tokens (including at the exact expiration time). Catch `jwt.ExpiredSignatureError`
for expiration or `jwt.InvalidTokenError` for any invalid token.

Set a private, randomly generated `SECRET_KEY` in the backend environment.
`ACCESS_TOKEN_EXPIRE_MINUTES` sets the default lifetime (30 minutes); the legacy
`ACCESS_TOKEN_MINUTES` setting is also supported, with the former taking precedence.
Creation accepts an optional `datetime.timedelta` lifetime of at least one second.

## JWT keys for local testing

There is no API key to request or account to register. JWTs use HS256, which uses
one secret for both signing and verification. Each teammate can generate their
own secret for their local backend.

From the project root, generate a secret:

```sh
openssl rand -hex 32
```

Keep the secret local; do not commit or share it. For a backend running directly
in your terminal, copy the generated value into the following command before
starting it or importing the utilities:

```sh
export SECRET_KEY='paste_your_generated_value_here'
```

The backend does not automatically load `backend/.env`; setting a value there
alone will not configure a directly launched Python process. Keep the same
secret between runs if you want existing tokens to remain valid. Changing the
secret invalidates tokens signed with the previous value.

### Get a token for testing

With the backend running, use the temporary technician account:

```sh
curl -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tech@example.com","password":"changeme123"}'
```

The response includes `access_token` and `token_type`. You can also try
`POST /auth/login` at http://localhost:8000/docs. The secret stays on the backend;
clients use the returned token. For a shared backend, teammates should log in
to that backend to get tokens; tokens created with a different local secret
will fail verification. These sample credentials are for local development only.
