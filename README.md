# 📱 Trakkka — Phone Theft Case Tracker

A lightweight, cloud-synced case management dashboard built for law enforcement to track stolen phone reports, manage evidence, and identify crime patterns.

&gt; **Built for:** Police stations and law enforcement officers handling mobile device theft cases.  
&gt; **Current Status:** MVP — cloud database with real-time sync, audit logging, and offline fallback.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Case Management** | Create, edit, delete, and search phone theft reports |
| **Real-Time Sync** | All changes sync instantly across devices via Supabase |
| **Offline Fallback** | Works without internet using localStorage; syncs when connection returns |
| **Search & Filter** | Search by phone number, IMEI, victim name, case ID, or location |
| **Status Pipeline** | Track cases through Open → Investigating → Closed / Recovered |
| **Audit Logging** | Tamper-proof database triggers log every insert, update, and delete |
| **CSV Export** | Export all cases for reports, courts, or superiors |
| **Zero Backend Code** | Pure HTML/CSS/JS frontend — no server to maintain |

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Database & Realtime:** [Supabase](https://supabase.com) (PostgreSQL + Realtime subscriptions)
- **Hosting:** [Vercel](https://vercel.com) (static site deployment from Git)
- **Audit Layer:** PostgreSQL triggers with `SECURITY DEFINER`

---

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/aristhegf/trakkka.git
cd trakkka