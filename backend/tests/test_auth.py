API = "/api/v1"


async def test_register_login_me_logout(client):
    r = await client.post(f"{API}/auth/register", json={"email": "alex@example.com", "password": "correct-horse-battery", "full_name": "Alex Rivera"})
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "alex@example.com"

    r = await client.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "correct-horse-battery"})
    assert r.status_code == 200
    assert "tmm_session" in r.cookies

    r = await client.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json()["full_name"] == "Alex Rivera"

    r = await client.post(f"{API}/auth/logout")
    assert r.status_code == 204

    r = await client.get(f"{API}/auth/me")
    assert r.status_code == 401


async def test_duplicate_email_rejected(client):
    body = {"email": "dup@example.com", "password": "correct-horse-battery", "full_name": "Dup"}
    assert (await client.post(f"{API}/auth/register", json=body)).status_code == 201
    assert (await client.post(f"{API}/auth/register", json=body)).status_code == 409


async def test_wrong_password(client):
    await client.post(f"{API}/auth/register", json={"email": "w@example.com", "password": "correct-horse-battery", "full_name": "W"})
    r = await client.post(f"{API}/auth/login", json={"email": "w@example.com", "password": "not-the-password"})
    assert r.status_code == 401


async def test_short_password_rejected(client):
    r = await client.post(f"{API}/auth/register", json={"email": "s@example.com", "password": "short", "full_name": "S"})
    assert r.status_code == 422


async def test_unauthenticated_routes(client):
    for path in ("/telegram-accounts", "/groups", "/migrations"):
        assert (await client.get(f"{API}{path}")).status_code == 401
    assert (await client.get(f"{API}/admin/overview")).status_code == 401
