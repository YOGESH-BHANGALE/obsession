# Deployment Guide — Criminal Network Analysis Platform (SHODH)

This guide walks you through deploying the project to **Render** (Backend) and **Vercel** (Frontend) for free with continuous deployment directly from your GitHub repository:
[`https://github.com/YOGESH-BHANGALE/obsession`](https://github.com/YOGESH-BHANGALE/obsession).

---

## Part 1: Deploy Backend on Render (Free)

1. Go to [dashboard.render.com](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Select your repository: `YOGESH-BHANGALE/obsession`.
4. Configure the Web Service:
   - **Name:** `obsession-backend` (or your preferred name)
   - **Region:** Choose the region closest to you (e.g., *Singapore* or *Frankfurt*)
   - **Branch:** `main`
   - **Root Directory:** `.` *(leave blank or set to dot)*
   - **Runtime:** `Python 3`
   - **Build Command:**
     ```bash
     pip install -r backend/requirements.txt
     ```
   - **Start Command:**
     ```bash
     uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type:** `Free`

5. Add **Environment Variables** in the *Environment* section:
   | Key | Value | Notes |
   |---|---|---|
   | `PYTHON_VERSION` | `3.13.1` | Match development Python version |
   | `NVIDIA_API_KEY` | `nvapi-...` | Your NVIDIA API key for Nemotron |
   | `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | Nemotron endpoint |
   | `NVIDIA_MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` | Nemotron model name |

6. Click **Create Web Service**.
7. Wait ~2–3 minutes for the build to finish. Once live, Render will assign a public URL, for example:
   ```
   https://obsession-backend.onrender.com
   ```
   *(Test it by opening `https://obsession-backend.onrender.com/health` in your browser — it should return `{"status": "healthy"}`).*

---

## Part 2: Deploy Frontend on Vercel (Free)

1. Go to [vercel.com](https://vercel.com/) and sign in with GitHub.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository: `YOGESH-BHANGALE/obsession`.
4. Configure the Project:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click *Edit* and select `frontend`
   - **Build and Output Settings:** *(Leave defaults: Build `npm run build`, Output `dist`)*
5. Under **Environment Variables**, add:
   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://obsession-backend.onrender.com` *(Use your Render URL from Part 1)* |
6. Click **Deploy**.
7. Vercel will build the frontend in ~30 seconds and provide your live URL:
   ```
   https://obsession-xxx.vercel.app
   ```

---

## Part 3: Verify and Login

Open your deployed Vercel URL in your browser:

### Demo Accounts:
| Role | Username | Password |
|---|---|---|
| **Investigator** | `investigator` | `invest123` |
| **Senior Authority** | `senior` | `senior123` |
| **System Admin** | `admin` | `admin123` |

### Key Features to Test:
- **Interactive Graph Visualization:** Force-directed syndicate network with node badges, risk rings, and edge inspection.
- **AI Investigator Assistant (NVIDIA Nemotron):** Natural language Q&A grounded strictly in case evidence.
- **Pattern Alerts:** 12 algorithmic indicators (communication bursts, phone hopping, circular transactions, bridge nodes).
- **Timeline & Spatial Map:** Predictive events and interactive geospatial tracking.
- **Real-Time WebSocket Updates:** Live graph and location updates dynamically connected to your backend.
