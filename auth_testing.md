# Auth-Gated App Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session in Mongo
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  pgpid: 'PGP001',
  email: 'PGP001@iim.ac.in',
  name: 'Test Student',
  role: 'student',
  active: true,
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
"
```

## Step 2: Backend API
```
curl -X GET "$API/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser
```
await page.context.add_cookies([{ "name": "session_token", "value": "YOUR_SESSION_TOKEN",
  "domain": "your-app.com", "path": "/", "httpOnly": true, "secure": true, "sameSite": "None" }])
```

## Roles
- Admin email: pgp41473@iiml.ac.in (auto-assigned admin role on login)
- Student: any @iim.ac.in / @iiml.ac.in email matched to imported student master data by email.

Auth is Google OAuth via Emergent — no app-managed passwords. Server-side authorization enforced on every endpoint.
