# Paisa Khata — Backend & MongoDB Integration (Phase 3)

Backend REST API for **Paisa Khata** built with Node.js 20+, Express.js, Mongoose, and Zod.

---

## 1. Quick Start

### Prerequisites
- Node.js 20+ LTS
- MongoDB Atlas cluster URI or local MongoDB (`mongodb://127.0.0.1:27017/hisab_khata`)

### Installation & Run
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Run development server (with Node --watch)
npm run dev

# Run automated integration test suite
npm test
```

---

## 2. MongoDB Atlas Setup Instructions

1. **Create an Atlas Account**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and register/log in.
2. **Create a Free Cluster**:
   - Select **M0 Free Tier** (AWS/GCP/Azure in your closest region e.g., Mumbai `ap-south-1`).
3. **Database Access (User Credentials)**:
   - Go to **Security > Database Access**.
   - Click **Add New Database User**.
   - Create a user (e.g. `hisab_user` with password). Keep role as **Read and write to any database**.
4. **Network Access (IP Whitelist)**:
   - Go to **Security > Network Access**.
   - Click **Add IP Address**.
   - For local development, choose **Add Current IP Address** or `0.0.0.0/0` (Allow Access from Anywhere during testing).
5. **Get Connection String**:
   - In Atlas, click **Connect** on your cluster.
   - Choose **Drivers** (Node.js).
   - Copy the connection string format:
     ```
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/hisab_khata?retryWrites=true&w=majority
     ```
   - Paste it into `backend/.env` under `MONGODB_URI`.

---

## 3. Endpoints Documentation

Protected endpoints use `devAuth` middleware in development (refuses to run if `NODE_ENV=production`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health & uptime check (public) |
| `GET` | `/api/customers` | List all active customers with calculated balances |
| `POST` | `/api/customers` | Create new customer (with opening balance in paise) |
| `GET` | `/api/customers/:id` | Get customer details and balance breakdown |
| `PATCH` | `/api/customers/:id` | Update customer details or archive status |
| `POST` | `/api/customers/:id/dues` | Add new due borrowing (idempotent with `clientTransactionId`) |
| `POST` | `/api/customers/:id/payments` | Record customer payment (idempotent with `clientTransactionId`) |
| `GET` | `/api/customers/:id/transactions` | Full chronological transaction ledger |
| `GET` | `/api/dashboard/summary` | Aggregated store balances and customer counts |
| `GET` | `/api/sync/status` | Current sync protocol status and server record counts |
| `POST` | `/api/sync/batch` | Batch process offline SQLite queued items |

---

## 4. Frontend Configuration (React Native / Expo)

Set the backend API URL in `frontend/.env`:

- **Android Emulator**:
  ```env
  EXPO_PUBLIC_API_URL=http://10.0.2.2:5000
  ```
- **iOS Simulator / Web**:
  ```env
  EXPO_PUBLIC_API_URL=http://localhost:5000
  ```
- **Physical Device (Expo Go)**:
  Find your computer's local Wi-Fi IP address (e.g., `192.168.1.15`):
  ```env
  EXPO_PUBLIC_API_URL=http://192.168.1.15:5000
  ```
