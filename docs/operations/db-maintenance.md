# Database Maintenance

How to run queries against the PostgreSQL Flexible Server on Azure from Cloud Shell or a local terminal.

---

## Prerequisites

- Azure CLI logged in (`az login` or active Cloud Shell session)
- Access to the target subscription

---

## Connecting via Azure Cloud Shell (recommended)

Cloud Shell has `psql` pre-installed. No local tooling needed.

### 1. Open Cloud Shell

In the Azure Portal click the `>_` icon in the top bar and choose **Bash**.

### 2. Extract credentials from the running Container App

The database URL (including password) is stored as a Container App secret:

```bash
ENV=staging   # or: production

DB_URL=$(az containerapp secret show \
  --name "ca-ostgut-${ENV}-backend" \
  --resource-group "rg-ostgut-${ENV}" \
  --secret-name database-url \
  --query value -o tsv)

# Parse out user and password (URL-decode the password)
ADMIN_USER=$(echo "$DB_URL" | sed 's|.*://||; s|:.*||')
ADMIN_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:||; s|@.*||' \
  | python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")
DB_HOST="psql-ostgut-${ENV}.postgres.database.azure.com"
```

### 3. Open an interactive psql session

```bash
PGPASSWORD="$ADMIN_PASS" psql \
  -h "$DB_HOST" \
  -U "$ADMIN_USER" \
  -d ostgut
```

You are now in a live psql REPL. Type `\q` to exit.

### 4. Run a one-off query non-interactively

```bash
PGPASSWORD="$ADMIN_PASS" psql \
  -h "$DB_HOST" \
  -U "$ADMIN_USER" \
  -d ostgut \
  -c "SELECT id, email, is_admin FROM users ORDER BY created_at DESC LIMIT 10;"
```

---

## Connecting from a local terminal

Requires `psql` installed locally (`brew install libpq`) and the Postgres firewall rule allowing your IP.

> Azure Flexible Server currently only allows Azure-internal traffic (`AllowAzureServices` rule).
> To connect from outside Azure you must temporarily add your IP via the Portal:
> **PostgreSQL server → Networking → Add current client IP address → Save**

Then:

```bash
PGPASSWORD="your-decoded-password" psql \
  -h psql-ostgut-staging.postgres.database.azure.com \
  -U your-admin-user \
  -d ostgut
```

Remove the firewall rule when done.

---

## Common maintenance queries

### Promote a user to admin

```sql
UPDATE users
SET is_admin = true, updated_at = NOW()
WHERE lower(email) = lower('user@example.com');
```

### Revoke admin

```sql
UPDATE users
SET is_admin = false, updated_at = NOW()
WHERE lower(email) = lower('user@example.com');
```

### List all admins

```sql
SELECT id, email, created_at
FROM users
WHERE is_admin = true
ORDER BY created_at;
```

### Check a user's subscription status

```sql
SELECT u.email, s.plan, s.status, s.current_period_end
FROM users u
JOIN subscriptions s ON s.user_id = u.id
WHERE lower(u.email) = lower('user@example.com');
```

### Count active subscriptions by plan

```sql
SELECT plan, status, COUNT(*)
FROM subscriptions
GROUP BY plan, status
ORDER BY plan, status;
```

### List recently registered users

```sql
SELECT id, email, name, is_admin, created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;
```

---

## Safety notes

- Always run a `SELECT` first to confirm the target rows before running `UPDATE` or `DELETE`.
- There are no soft-deletes — `DELETE` is permanent.
- The DB admin user has full privileges. Queries run here bypass application-level auth.
